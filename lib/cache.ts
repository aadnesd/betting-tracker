import { revalidateTag } from "next/cache";

export const dashboardTag = (userId: string) => `dashboard:${userId}`;

export function revalidateDashboard(userId: string) {
  revalidateTag(dashboardTag(userId), "default");
}
