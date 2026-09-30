import { redirect } from "next/navigation";

/** The site root sends applicants to the public application form. */
export default function Home() {
  redirect("/apply");
}
