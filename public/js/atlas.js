const CHARSETS = {
  STANDARD: "$@B%8&WM#*oahkbdpqwmZO0QLCJUYXzcvunxrjft/\\|()1{}[]?-_+~<>i!lI;:,\"^`'. ",
  MINIMAL: "@%#*+=-:. ",
  BLOCKS: "█▓▒░ ",
  BINARY: "01 ",
  NUMERIC: "0123456789 ",
  SIMPLE: "#+-:. "
};

function createAtlas(charsetName = "STANDARD") {
  const charset = CHARSETS[charsetName] || CHARSETS.STANDARD;
  const size = 64;
  const count = charset.length;

  const canvas = document.createElement("canvas");
  canvas.width = size * count;
  canvas.height = size;

  const ctx = canvas.getContext("2d");

  ctx.fillStyle = "black";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = "white";
  ctx.font = `bold ${size}px monospace`;
  ctx.textBaseline = "top";
  ctx.textAlign = "left";

  for (let i = 0; i < count; i++) {
    ctx.fillText(charset[i], i * size, 0);
  }

  return { canvas, count };
}
