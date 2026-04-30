import { ModelPreloadGate } from "@/app/_components/model-preload-gate";

export default function SessionLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <ModelPreloadGate>{children}</ModelPreloadGate>;
}
