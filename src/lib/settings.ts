import type { RowDataPacket } from "mysql2";
import { pool } from "./db";

export type HomeSettings = {
  siteName: string;
  badgeText: string;
  heroTitle: string;
  heroSubtitle: string;
  ctaLabel: string;
  ctaHref: string;
  heroImage: string | null;
  instagramUrl: string;
  xUrl: string;
  facebookUrl: string;
  aboutText: string;
  contactEmail: string;
};

export const DEFAULT_HOME: HomeSettings = {
  siteName: "Tên của bạn",
  badgeText: "Chào mừng bạn đến với website của tôi",
  heroTitle: "Khám phá cùng tôi",
  heroSubtitle:
    "Nơi tôi lưu lại những chuyến đi, những dòng chữ và những điều học được trên đường.",
  ctaLabel: "Xem hành trình",
  ctaHref: "/discovery",
  heroImage: null,
  instagramUrl: "",
  xUrl: "",
  facebookUrl: "",
  aboutText: "",
  contactEmail: "",
};

type Row = RowDataPacket & {
  site_name: string;
  badge_text: string;
  hero_title: string;
  hero_subtitle: string;
  cta_label: string;
  cta_href: string;
  hero_image: string | null;
  instagram_url: string;
  x_url: string;
  facebook_url: string;
  about_text: string | null;
  contact_email: string;
};

export async function getHomeSettings(): Promise<HomeSettings> {
  try {
    const [rows] = await pool.query<Row[]>(
      "SELECT * FROM home_settings WHERE id = 1 LIMIT 1"
    );
    const r = rows[0];
    if (!r) return DEFAULT_HOME;
    return {
      siteName: r.site_name,
      badgeText: r.badge_text,
      heroTitle: r.hero_title,
      heroSubtitle: r.hero_subtitle,
      ctaLabel: r.cta_label,
      ctaHref: r.cta_href,
      heroImage: r.hero_image,
      instagramUrl: r.instagram_url,
      xUrl: r.x_url,
      facebookUrl: r.facebook_url,
      aboutText: r.about_text ?? "",
      contactEmail: r.contact_email ?? "",
    };
  } catch (err) {
    // Chưa cấu hình database: vẫn hiển thị trang với nội dung mặc định.
    console.error("Không đọc được home_settings:", err);
    return DEFAULT_HOME;
  }
}

export async function updateHomeSettings(s: HomeSettings): Promise<void> {
  await pool.execute(
    `UPDATE home_settings SET
       site_name = ?, badge_text = ?, hero_title = ?, hero_subtitle = ?,
       cta_label = ?, cta_href = ?, hero_image = ?,
       instagram_url = ?, x_url = ?, facebook_url = ?,
       about_text = ?, contact_email = ?
     WHERE id = 1`,
    [
      s.siteName,
      s.badgeText,
      s.heroTitle,
      s.heroSubtitle,
      s.ctaLabel,
      s.ctaHref,
      s.heroImage,
      s.instagramUrl,
      s.xUrl,
      s.facebookUrl,
      s.aboutText || null,
      s.contactEmail,
    ]
  );
}

// ===== Các khu vực của trang chủ (bật/tắt và thứ tự) =====
export type HomeSectionKey =
  | "featured_journeys" | "latest_discovery" | "cyber_lab"
  | "latest_articles" | "featured_projects" | "about";

export const SECTION_LABEL: Record<HomeSectionKey, string> = {
  featured_journeys: "Hành trình nổi bật",
  latest_discovery: "Ảnh Discovery mới",
  cyber_lab: "Cyber Lab",
  latest_articles: "Bài viết và tài liệu mới",
  featured_projects: "Dự án nổi bật",
  about: "Giới thiệu",
};

export type HomeSection = { key: HomeSectionKey; enabled: boolean; sortOrder: number };

const DEFAULT_SECTIONS: HomeSection[] = (Object.keys(SECTION_LABEL) as HomeSectionKey[]).map(
  (key, i) => ({ key, enabled: true, sortOrder: (i + 1) * 10 })
);

export async function getHomeSections(): Promise<HomeSection[]> {
  try {
    const [rows] = await pool.query<RowDataPacket[]>(
      "SELECT section_key, is_enabled, sort_order FROM home_sections ORDER BY sort_order, section_key"
    );
    const list = rows
      .filter((r) => (r.section_key as string) in SECTION_LABEL)
      .map((r) => ({
        key: r.section_key as HomeSectionKey,
        enabled: r.is_enabled === 1,
        sortOrder: r.sort_order as number,
      }));
    return list.length ? list : DEFAULT_SECTIONS;
  } catch {
    return DEFAULT_SECTIONS;
  }
}

export async function setSectionEnabled(key: string, enabled: boolean): Promise<void> {
  await pool.query("UPDATE home_sections SET is_enabled = ? WHERE section_key = ?", [enabled ? 1 : 0, key]);
}

/** Đổi chỗ khu vực với khu vực liền trước/sau trong danh sách. */
export async function moveSection(key: string, dir: "up" | "down"): Promise<void> {
  const list = await getHomeSections();
  const i = list.findIndex((s) => s.key === key);
  const j = dir === "up" ? i - 1 : i + 1;
  if (i < 0 || j < 0 || j >= list.length) return;
  const order = list.map((s) => s.key);
  [order[i], order[j]] = [order[j], order[i]];
  for (let n = 0; n < order.length; n++) {
    await pool.query(
      "INSERT INTO home_sections (section_key, sort_order) VALUES (?, ?) ON DUPLICATE KEY UPDATE sort_order = VALUES(sort_order)",
      [order[n], (n + 1) * 10]
    );
  }
}
