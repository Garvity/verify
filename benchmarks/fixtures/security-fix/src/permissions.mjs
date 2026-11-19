export function canDeleteUsers(role) {
  return role !== "viewer";
}
