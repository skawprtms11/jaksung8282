import { describe, expect, it } from "vitest";
import { normalizeJoystickInput } from "../src/components/game/sky-pup/controls";

describe("normalizeJoystickInput", () => {
  it("ignores movement inside the joystick deadzone", () => {
    expect(normalizeJoystickInput(0.01, 0.005)).toEqual({ x: 0, y: 0 });
  });

  it("makes a small intentional movement immediately noticeable", () => {
    const input = normalizeJoystickInput(0.1, 0);
    expect(input.x).toBeGreaterThanOrEqual(0.47);
    expect(input.y).toBe(0);
  });

  it("preserves direction while capping movement at full speed", () => {
    const input = normalizeJoystickInput(3, 4);
    expect(Math.hypot(input.x, input.y)).toBeCloseTo(1);
    expect(input.x).toBeCloseTo(0.6);
    expect(input.y).toBeCloseTo(0.8);
  });
});
