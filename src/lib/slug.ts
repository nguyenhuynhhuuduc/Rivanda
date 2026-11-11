// "Hành trình Đà Lạt" -> "hanh-trinh-da-lat"
export function slugify(input: string, fallback = "muc"): string {
  const s = input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[đĐ]/g, "d")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    .replace(/-+$/g, "");
  return s || fallback;
}

export function randomSuffix(): string {
  return Math.random().toString(36).slice(2, 6);
}
