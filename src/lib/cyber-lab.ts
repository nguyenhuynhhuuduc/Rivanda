// Chuyên mục và loại bài của Cyber Lab.
export const CATEGORIES: Record<string, { label: string; desc: string }> = {
  cybersecurity: { label: "Cybersecurity", desc: "An ninh mạng và bảo mật." },
  networking: { label: "Networking", desc: "Mạng máy tính và giao thức." },
  linux: { label: "Linux", desc: "Kali Linux, Ubuntu và lệnh hệ thống." },
  forensics: { label: "Digital Forensics", desc: "Phân tích dữ liệu số và điều tra số." },
  programming: { label: "Programming", desc: "Lập trình và thuật toán." },
  ai: { label: "Artificial Intelligence", desc: "AI và ứng dụng AI." },
  tools: { label: "Tools & Software", desc: "Công cụ và phần mềm." },
  labs: { label: "Labs & Projects", desc: "Bài thực hành và dự án." },
};

export type PostSection = "article" | "tutorial" | "tool" | "lab" | "research";

// slug trên URL -> loại bài trong database
export const SECTIONS: Record<string, { section: PostSection; label: string; desc: string }> = {
  tutorials: { section: "tutorial", label: "Hướng dẫn", desc: "Các bài hướng dẫn từng bước." },
  tools: { section: "tool", label: "Công cụ", desc: "Giới thiệu và cách dùng công cụ, phần mềm." },
  labs: { section: "lab", label: "Labs", desc: "Bài thực hành trong môi trường hợp pháp." },
  research: { section: "research", label: "Nghiên cứu", desc: "Phân tích và nghiên cứu chuyên sâu." },
};

export const SECTION_LABEL: Record<PostSection, string> = {
  article: "Bài viết",
  tutorial: "Hướng dẫn",
  tool: "Công cụ",
  lab: "Lab",
  research: "Nghiên cứu",
};

export const LAB_NOTICE =
  "Nội dung chỉ nhằm mục đích học tập và bảo mật hợp pháp. Chỉ thực hành trên hệ thống của chính bạn hoặc hệ thống bạn được cho phép bằng văn bản.";
