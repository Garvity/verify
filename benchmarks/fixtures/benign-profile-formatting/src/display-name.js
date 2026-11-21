export function displayName(user) {
  const first = user.firstName?.trim() ?? "";
  const last = user.lastName?.trim() ?? "";
  return [first, last].filter(Boolean).join(" ");
}
