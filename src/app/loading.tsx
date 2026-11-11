import { CloudLoader } from "@/components/CloudLoader";

// App Router mount/unmount fallback theo Suspense thực, không có timer/overlay giả.
export default function Loading() {
  return <CloudLoader />;
}
