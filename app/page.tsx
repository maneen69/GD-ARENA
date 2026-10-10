import Arena from "./Arena";

export default function Page() {
  const liveEnabled =
    process.env.MOCK_LLM !== "true" && Boolean(process.env.LLM_API_KEY);
  return <Arena liveEnabled={liveEnabled} />;
}
