export function normalizeJoystickInput(x: number, y: number) {
  const length = Math.hypot(x, y);
  if (length < 0.015) return { x: 0, y: 0 };

  const directionX = x / length;
  const directionY = y / length;
  const response = Math.min(1, 0.42 + Math.min(1, length) * 0.58);
  return { x: directionX * response, y: directionY * response };
}
