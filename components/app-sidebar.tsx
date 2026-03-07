"use client";

import {
  ArrowUpDown,
  BarChart3,
  Gift,
  LayoutDashboard,
  ListChecks,
  LogIn,
  PlusSquare,
  Settings,
  Wallet,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { User } from "next-auth";
import { SidebarUserNav } from "@/components/sidebar-user-nav";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";

const navigation = [
  { name: "Dashboard", href: "/bets", icon: LayoutDashboard },
  { name: "Matched Bets", href: "/bets/matched", icon: ListChecks },
  { name: "Quick Add", href: "/bets/quick-add", icon: PlusSquare },
  { name: "Reports", href: "/bets/reports", icon: BarChart3 },
  { name: "Bankroll", href: "/bets/bankroll", icon: Wallet },
  { name: "Transactions", href: "/bets/transactions", icon: ArrowUpDown },
  { name: "Free Bets", href: "/bets/settings/promos", icon: Gift },
];

const settingsNavigation = [
  { name: "Accounts", href: "/bets/settings/accounts" },
  { name: "Wallets", href: "/bets/settings/wallets" },
  { name: "Competitions", href: "/bets/settings/competitions" },
];

export function AppSidebar({ user }: { user: User | undefined }) {
  const pathname = usePathname();
  const { setOpenMobile } = useSidebar();

  return (
    <Sidebar className="group-data-[side=left]:border-r-0">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <Link
              className="flex flex-row items-center gap-2 px-2 py-1"
              href="/bets"
              onClick={() => setOpenMobile(false)}
              prefetch={false}
            >
              <span className="font-semibold text-lg">Bet Tracker</span>
            </Link>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {navigation.map((item) => {
                const isActive = pathname === item.href;
                return (
                  <SidebarMenuItem key={item.name}>
                    <SidebarMenuButton asChild isActive={isActive}>
                      <Link
                        href={item.href}
                        onClick={() => setOpenMobile(false)}
                        prefetch={false}
                      >
                        <item.icon className="size-4" />
                        <span>{item.name}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        <SidebarGroup>
          <SidebarGroupLabel>
            <Settings className="mr-2 size-3" />
            Settings
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {settingsNavigation.map((item) => {
                const isActive = pathname === item.href;
                return (
                  <SidebarMenuItem key={item.name}>
                    <SidebarMenuButton asChild isActive={isActive}>
                      <Link
                        href={item.href}
                        onClick={() => setOpenMobile(false)}
                        prefetch={false}
                      >
                        <span>{item.name}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        {user ? (
          <SidebarUserNav user={user} />
        ) : (
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton asChild>
                <Link href="/login">
                  <LogIn className="size-4" />
                  <span>Sign in</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        )}
      </SidebarFooter>
    </Sidebar>
  );
}
