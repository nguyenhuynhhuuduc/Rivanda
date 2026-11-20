/** @type {import('next').NextConfig} */
const nextConfig = {
  // sharp (tạo ảnh thu nhỏ) và nodemailer là thư viện chạy phía server, không đóng gói vào bundle
  serverExternalPackages: ["sharp", "nodemailer"],
  experimental: {
    // Cho phép tải tối đa 40 ảnh × 8MB mỗi lần (kèm dữ liệu form) qua Server Action và Proxy
    serverActions: { bodySizeLimit: "340mb" },
    proxyClientMaxBodySize: "340mb",
  },
  async headers() {
    return [{ source: "/:path*", headers: [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "no-referrer" },
      { key: "X-Frame-Options", value: "SAMEORIGIN" },
    ] }];
  },
  // Đường dẫn cũ tự chuyển sang đường dẫn mới, không có liên kết chết
  async redirects() {
    return [
      { source: "/hacking", destination: "/cyber-lab", permanent: true },
      { source: "/hacking/:slug", destination: "/cyber-lab/articles/:slug", permanent: true },
      { source: "/document", destination: "/resources", permanent: true },
      { source: "/document/:slug", destination: "/documents/blog/:slug", permanent: true },
      { source: "/shopping", destination: "/shop", permanent: true },
      // Chỉ chuyển các route thư viện cũ; /discovery dành riêng cho cộng đồng.
      ...["explore", "trending", "journeys", "albums", "locations"].map((section) => ({
        source: `/discovery/${section}`, destination: `/journeystory/${section}`, permanent: true,
      })),
      ...["journeys", "albums", "tags"].map((section) => ({
        source: `/discovery/${section}/:slug`, destination: `/journeystory/${section}/:slug`, permanent: true,
      })),
      { source: "/discovery/photos/:id", destination: "/journeystory/photos/:id", permanent: true },
      { source: "/discovery/:id([a-f0-9-]{36})", destination: "/journeystory/photos/:id", permanent: true },
      { source: "/documents", destination: "/resources", permanent: true },
      { source: "/documents/resources", destination: "/resources/documents", permanent: true },
      { source: "/documents/resources/:id", destination: "/resources/:id", permanent: true },
      { source: "/documents/projects", destination: "/resources/projects", permanent: true },
    ];
  },
};

export default nextConfig;
