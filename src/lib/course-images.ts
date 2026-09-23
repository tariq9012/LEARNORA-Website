import heroStudy from "@/assets/hero-study.jpg";
import coverWeb from "@/assets/cover-web.jpg";
import coverData from "@/assets/cover-data.jpg";
import coverDesign from "@/assets/cover-design.jpg";
import coverSecurity from "@/assets/cover-security.jpg";
import coverBusiness from "@/assets/cover-business.jpg";
import coverMobile from "@/assets/cover-mobile.jpg";

export { heroStudy };

const byCategory: Record<string, string> = {
  "web-development": coverWeb,
  programming: coverWeb,
  "data-science": coverData,
  design: coverDesign,
  cybersecurity: coverSecurity,
  business: coverBusiness,
  marketing: coverBusiness,
  mobile: coverMobile,
};

export const categoryImage = (slug: string) => byCategory[slug] ?? coverWeb;
