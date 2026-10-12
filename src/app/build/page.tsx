import { redirect } from "next/navigation";
import { DEMO_MATCH_ID } from "@/lib/demo/demo";

/** Build XI opens the demo match (the MVP's primary path). Live fixtures are opened from Match Desk. */
export default function BuildIndex() {
  redirect(`/build/${DEMO_MATCH_ID}`);
}
