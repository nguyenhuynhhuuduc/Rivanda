import { revalidatePath } from "next/cache";
export function refreshBlog(): void {
  revalidatePath("/documents/blog", "layout");
  revalidatePath("/account/blog", "layout");
  revalidatePath("/admin/blog", "layout");
  revalidatePath("/admin/posts");
  revalidatePath("/", "layout");
}
