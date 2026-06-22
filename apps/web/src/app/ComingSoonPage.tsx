import { useLocation } from "react-router-dom";
import { Construction } from "lucide-react";

import { EmptyState } from "@/shared/states/EmptyState";
import { findNavItem } from "@/app/navigation";

/** Shared placeholder for nav domains that are not yet implemented. */
export function ComingSoonPage() {
  const { pathname } = useLocation();
  const item = findNavItem(pathname);
  const label = item?.label ?? "该模块";

  return (
    <div className="grid place-items-center py-[8vh]">
      <EmptyState
        icon={<Construction />}
        title={label}
        description="建设中"
      />
    </div>
  );
}
