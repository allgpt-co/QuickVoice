export function isBuiltInNumberManager(role: string | null | undefined) {
  if (!role) return false;
  return role
    .split(",")
    .map((candidate) => candidate.trim().toLowerCase())
    .some((candidate) => candidate === "owner" || candidate === "admin");
}
