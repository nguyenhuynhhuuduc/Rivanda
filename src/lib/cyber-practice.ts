/** Chưa có adapter backend. Không suy ra trạng thái máy từ URL, storage hoặc flag client. */
export function getPracticeAvailability() {
  return {
    status: "unavailable",
    machine: null,
    reason: "Backend thực hành chưa khả dụng. Hiện chưa thể khởi tạo máy Linux hoặc mở Desktop.",
  } as const;
}
