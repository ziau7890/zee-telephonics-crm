import { redirect } from "next/navigation";

/** The whole app is the CRM; the public website is a separate project. */
export default function Home() {
  redirect("/crm");
}
