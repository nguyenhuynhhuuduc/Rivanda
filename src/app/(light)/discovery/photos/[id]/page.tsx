// Tương thích route cũ; next.config.mjs chuyển hướng vĩnh viễn sang JourneyStory.
export const dynamic = "force-dynamic";
export { default, generateMetadata } from "@/app/(light)/journeystory/photos/[id]/page";
