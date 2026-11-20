import { PageLoader } from "@/components/PageLoader";

// App Router mount/unmount fallback theo Suspense thực, không có timer/overlay giả.
export default function Loading() {
  return <PageLoader />;
}
