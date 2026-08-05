const MINIMUM_INITIAL_PASSWORD_LENGTH = 6;

export function getInitialPassword(employeeNo: string) {
  return employeeNo.trim().padEnd(MINIMUM_INITIAL_PASSWORD_LENGTH, "0");
}

export function isInitialPasswordAdjusted(employeeNo: string) {
  return employeeNo.trim().length < MINIMUM_INITIAL_PASSWORD_LENGTH;
}
