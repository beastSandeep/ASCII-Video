const VERTEX_SHADER = `
attribute vec2 a_position;
varying vec2 v_uv;

void main() {
  v_uv = (a_position + 1.0) * 0.5;
  gl_Position = vec4(a_position, 0.0, 1.0);
}
`;

const FRAGMENT_SHADER = `
precision mediump float;

uniform sampler2D u_video;
uniform sampler2D u_atlas;

uniform vec2 u_resolution;
uniform float u_charSize;
uniform float u_charCount;

uniform float u_brightness;
uniform float u_contrast;
uniform float u_saturation;
uniform float u_gamma;
uniform float u_sharpness;
uniform bool u_colorMode;
uniform bool u_invert;
uniform vec3 u_bgColor;

uniform float u_spacing;
uniform int u_effectStyle;
uniform int u_asciiVariation;
uniform bool u_showOriginal;

uniform float u_edgeStrength;
uniform float u_edgeThreshold;
uniform float u_dirEdgeThreshold;

uniform float u_audioData[64];
uniform bool u_showVisualizer;
uniform float u_visualizerIntensity;
uniform float u_stability;

uniform float u_time;

// Sobel Edge Detection
vec2 getGradient(sampler2D tex, vec2 uv) {
  vec2 res = 1.0 / u_resolution;
  float h = 0.0;
  float v = 0.0;
  
  // Sobel kernels
  // Horizontal
  h += texture2D(tex, uv + vec2(-res.x, -res.y)).r * -1.0;
  h += texture2D(tex, uv + vec2(-res.x,  0.0)).r * -2.0;
  h += texture2D(tex, uv + vec2(-res.x,  res.y)).r * -1.0;
  h += texture2D(tex, uv + vec2( res.x, -res.y)).r *  1.0;
  h += texture2D(tex, uv + vec2( res.x,  0.0)).r *  2.0;
  h += texture2D(tex, uv + vec2( res.x,  res.y)).r *  1.0;
  
  // Vertical
  v += texture2D(tex, uv + vec2(-res.x, -res.y)).r * -1.0;
  v += texture2D(tex, uv + vec2( 0.0,   -res.y)).r * -2.0;
  v += texture2D(tex, uv + vec2( res.x,  -res.y)).r * -1.0;
  v += texture2D(tex, uv + vec2(-res.x,  res.y)).r *  1.0;
  v += texture2D(tex, uv + vec2( 0.0,    res.y)).r *  2.0;
  v += texture2D(tex, uv + vec2( res.x,  res.y)).r *  1.0;
  
  return vec2(h, v);
}

// Detailed Post-Processing Uniforms
uniform bool u_bloom;
uniform float u_bloomThreshold;
uniform float u_bloomSoft;
uniform float u_bloomIntensity;
uniform float u_bloomRadius;

uniform bool u_grain;
uniform float u_grainIntensity;
uniform float u_grainSize;
uniform float u_grainSpeed;

uniform bool u_chromatic;
uniform float u_chromaticOffset;

uniform bool u_scanlines;
uniform float u_scanlineOpacity;
uniform float u_scanlineSpacing;

uniform bool u_vignette;
uniform float u_vignetteIntensity;
uniform float u_vignetteRadius;

uniform bool u_crtCurve;
uniform float u_crtAmount;

uniform bool u_phosphor;
uniform vec3 u_phosphorColor;

varying vec2 v_uv;

float random(vec2 co) {
  return fract(sin(dot(co.xy, vec2(12.9898, 78.233))) * 43758.5453);
}

vec2 crtWarp(vec2 uv, float amount) {
  uv = uv * 2.0 - 1.0;
  vec2 offset = abs(uv.yx) / vec2(6.0, 4.0);
  uv = uv + uv * offset * offset * amount * 10.0;
  uv = uv * 0.5 + 0.5;
  return uv;
}

vec3 getSharpenedColor(sampler2D tex, vec2 uv) {
  vec2 res = 1.0 / u_resolution;
  vec3 c = texture2D(tex, uv).rgb;
  if (u_sharpness <= 0.0) return c;
  vec3 n = texture2D(tex, uv + vec2(0, res.y)).rgb;
  vec3 s = texture2D(tex, uv + vec2(0, -res.y)).rgb;
  vec3 e = texture2D(tex, uv + vec2(res.x, 0)).rgb;
  vec3 w = texture2D(tex, uv + vec2(-res.x, 0)).rgb;
  vec3 sharpened = c * (1.0 + 4.0 * u_sharpness) - (n + s + e + w) * u_sharpness;
  return clamp(sharpened, 0.0, 1.0);
}

void main() {
  vec2 uv = v_uv;
  
  if (u_crtCurve) {
    uv = crtWarp(uv, u_crtAmount);
    if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {
      gl_FragColor = vec4(u_bgColor, 1.0);
      return;
    }
  }

  vec2 pixel = uv * u_resolution;
  vec2 cell = floor(pixel / u_charSize);
  vec2 center = (cell * u_charSize + u_charSize * 0.5) / u_resolution;

  // Determine sampling position
  vec2 sampleUV = u_showOriginal ? uv : center;

  // 1. Get raw color and initial luminance
  vec3 color;
  if (u_chromatic) {
    color.r = getSharpenedColor(u_video, sampleUV + vec2(u_chromaticOffset, 0.0)).r;
    color.g = getSharpenedColor(u_video, sampleUV).g;
    color.b = getSharpenedColor(u_video, sampleUV - vec2(u_chromaticOffset, 0.0)).b;
  } else {
    color = getSharpenedColor(u_video, sampleUV);
  }
  
  float rawLuminance = dot(color, vec3(0.299, 0.587, 0.114));

  // 2. Apply Saturation first using raw luminance
  color = mix(vec3(rawLuminance), color, u_saturation);

  // 3. Apply other color adjustments to the saturated color
  color = (color - 0.5) * u_contrast + 0.5 + (u_brightness - 1.0);
  color = clamp(color, 0.0, 1.0);
  color = pow(color, vec3(1.0 / u_gamma));

  // 4. Calculate final luminance for character mapping
  float finalLuminance = dot(color, vec3(0.299, 0.587, 0.114));

  // 5. Apply Temporal Stability (Snapping) ONLY to the mapping luminance
  float charLuminance = finalLuminance;
  if (u_stability > 0.0) {
      float levels = mix(256.0, 8.0, u_stability);
      charLuminance = floor(charLuminance * levels + 0.5) / levels;
  }

  vec3 finalColor;
  float glyphGlow = 1.0;

  if (u_showOriginal) {
    finalColor = color;
    glyphGlow = finalLuminance;
  } else {
    float gray = charLuminance;
    if (u_invert) gray = 1.0 - gray;

    // ASCII mapping
    vec2 local = mod(pixel, u_charSize) / u_charSize;
    local = (local - 0.5) * u_spacing + 0.5;

    float glyph = 0.0;
    bool insideChar = (local.x >= 0.0 && local.x <= 1.0 && local.y >= 0.0 && local.y <= 1.0);

    // Audio Visualizer Logic
    bool isViz = false;
    if (u_showVisualizer) {
        float vizHeight = 0.2; // 20% of screen
        if (v_uv.y < vizHeight) {
            int bin = int(v_uv.x * 63.0);
            float val = 0.0;
            // Manual unroll or loop for GLSL ES 1.0 compatibility
            for(int i=0; i<64; i++) { if(i == bin) val = u_audioData[i]; }
            
            float threshold = (v_uv.y / vizHeight);
            if (val * u_visualizerIntensity > threshold) {
                isViz = true;
                // Use bars for visualizer
                float vIndex = floor(threshold * 5.0 + val * 5.0);
                glyph = texture2D(u_atlas, vec2((vIndex + local.x) / u_charCount, local.y)).r;
            }
        }
    }

    if (insideChar && !isViz) {
      if (u_effectStyle == 0) { // ASCII Art Base
        if (u_asciiVariation == 0) { // Standard
          float index = floor(gray * (u_charCount - 1.0));
          glyph = texture2D(u_atlas, vec2((index + local.x) / u_charCount, local.y)).r;
        }
        else if (u_asciiVariation == 1) { // Edge-Enhanced
          vec2 grad = getGradient(u_video, center);
          float edge = length(grad);
          edge = smoothstep(u_edgeThreshold, u_edgeThreshold + 0.1, edge) * u_edgeStrength;
          float index = floor(clamp(gray + edge, 0.0, 1.0) * (u_charCount - 1.0));
          glyph = texture2D(u_atlas, vec2((index + local.x) / u_charCount, local.y)).r;
        }
        else if (u_asciiVariation == 2) { // Directional
          vec2 grad = getGradient(u_video, center);
          float edge = length(grad);
          if (edge > u_dirEdgeThreshold) {
            float angle = atan(grad.y, grad.x) / 3.14159; 
            float dirIndex = floor(((angle + 1.0) * 0.5) * u_charCount);
            glyph = texture2D(u_atlas, vec2((dirIndex + local.x) / u_charCount, local.y)).r;
          } else {
            float index = floor(gray * (u_charCount - 1.0));
            glyph = texture2D(u_atlas, vec2((index + local.x) / u_charCount, local.y)).r;
          }
        }
        else if (u_asciiVariation == 3) { // Sharp Detailed
          vec3 d = getSharpenedColor(u_video, center);
          float dGray = dot(d, vec3(0.299, 0.587, 0.114));
          float index = floor(dGray * (u_charCount - 1.0));
          glyph = texture2D(u_atlas, vec2((index + local.x) / u_charCount, local.y)).r;
        }
        glyph = smoothstep(0.15, 0.85, glyph);
      } 
      else if (u_effectStyle == 1) { // Halftone Dots
        glyph = 1.0 - smoothstep(gray * 0.5 - 0.05, gray * 0.5 + 0.05, distance(local, vec2(0.5)));
      } 
      else if (u_effectStyle == 2) { // Matrix Rain
        float rand = random(cell);
        float fall = fract(cell.y * 0.05 + u_time * (0.5 + rand * 1.5) + rand);
        float matrixIndex = floor(random(cell + floor(u_time * 10.0)) * u_charCount);
        glyph = texture2D(u_atlas, vec2((matrixIndex + local.x) / u_charCount, local.y)).r;
        glyph = smoothstep(0.2, 0.8, glyph) * (smoothstep(0.7, 1.0, fall) * 0.8 + 0.2) * gray;
      }
    }

    if (u_colorMode) {
      finalColor = mix(u_bgColor, color, glyph);
    } else {
      if (u_effectStyle == 2) {
        finalColor = mix(u_bgColor, vec3(0.0, glyph, glyph * 0.2), 1.0);
      } else {
        finalColor = mix(u_bgColor, vec3(1.0), glyph);
      }
    }
    glyphGlow = glyph;
  }

  // Phosphor bleed
  if (u_phosphor) {
      finalColor = mix(finalColor, finalColor * u_phosphorColor, 0.5) + u_phosphorColor * glyphGlow * 0.2;
  }

  // Bloom (multi-tap approximation)
  if (u_bloom) {
    vec3 bloom = vec3(0.0);
    // Use raw color for bloom context
    bloom += max(vec3(0.0), finalColor - u_bloomThreshold);
    finalColor += bloom * u_bloomIntensity;
  }

  // Scanlines
  if (u_scanlines) {
    float scanline = sin(pixel.y * u_scanlineSpacing) * 0.5 + 0.5;
    finalColor -= finalColor * scanline * u_scanlineOpacity;
  }

  // Grain
  if (u_grain) {
    float noise = random(uv * (u_grainSize * 10.0 + 1.0) + fract(u_time * u_grainSpeed));
    finalColor = mix(finalColor, finalColor * noise, u_grainIntensity);
  }

  // Vignette
  if (u_vignette) {
    float dist = distance(uv, vec2(0.5));
    finalColor *= smoothstep(u_vignetteRadius + 0.5, u_vignetteRadius - 0.2, dist * u_vignetteIntensity * 2.0);
  }

  gl_FragColor = vec4(finalColor, 1.0);
}
`;
