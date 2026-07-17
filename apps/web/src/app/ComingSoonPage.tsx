import { Link, useLocation } from "react-router-dom";
import { ArrowLeft, Construction } from "lucide-react";

import { Button } from "@/design/ui/button";
import { EmptyState } from "@/design/ui/state";
import { findNavItem } from "@/app/navigation";

/** Shared placeholder for nav domains that are not yet implemented. */
export function ComingSoonPage() {
  const { pathname } = useLocation();
  const item = findNavItem(pathname);
  const label = item?.label ?? "该模块";

  return (
    <div className="grid min-h-[60dvh] place-items-center">
      <EmptyState
        icon={<Construction />}
        title={`Tracevane「${label}」建设中`}
        description={
          item?.subtitle
            ? `该模块将提供：${item.subtitle} 功能完成后会在这里上线。`
            : "该模块正在建设中，功能完成后会在这里上线。"
        }
        action={
          <Button asChild variant="outline" size="sm">
            <Link to="/dashboard">
              <ArrowLeft />
              返回首页
            </Link>
          </Button>
        }
      />
    </div>
  );
}
