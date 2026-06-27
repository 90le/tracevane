import * as React from "react";
import iconExtensions from "../../../../../node_modules/pretty-file-icons/index.json";
import { Folder } from "lucide-react";

import { cn } from "@/design/lib/utils";
import type { FileEntrySummary } from "@/features/workspace/files/types";

const iconLoaders = import.meta.glob(
  "../../../../../node_modules/pretty-file-icons/svg/*.svg",
  {
    query: "?url",
    import: "default",
  },
) as Record<string, () => Promise<string>>;

const iconLoaderByName = new Map(
  Object.entries(iconLoaders).map(([path, loader]) => [
    path.replace(/^.*\/([^/]+)\.svg$/, "$1"),
    loader,
  ]),
);
const iconUrlCache = new Map<string, string>();
const extensionIconMap = iconExtensions as Record<string, string>;

export interface FileTypeIconProps {
  entry: FileEntrySummary;
  size: "sm" | "lg";
}

export default function FileTypeIcon({ entry, size }: FileTypeIconProps) {
  const className = cn(size === "lg" ? "size-8" : "size-4 shrink-0");
  if (entry.kind === "directory") {
    return (
      <span
        className={cn(className, "grid place-items-center text-primary")}
        aria-label="目录"
        data-file-manager-file-type-icon="folder"
      >
        <Folder className="size-full" />
      </span>
    );
  }
  return (
    <FileIconImage
      className={className}
      fileName={entry.name}
      label={entry.ext || "file"}
    />
  );
}

function FileIconImage({
  className,
  fileName,
  label,
}: {
  className: string;
  fileName: string;
  label: string;
}) {
  const iconName = iconNameForFile(fileName);
  const [iconUrl, setIconUrl] = React.useState(() => iconUrlCache.get(iconName));

  React.useEffect(() => {
    let canceled = false;
    const cached = iconUrlCache.get(iconName);
    if (cached) {
      setIconUrl(cached);
      return () => {
        canceled = true;
      };
    }
    const loader = iconLoaderByName.get(iconName) ?? iconLoaderByName.get("unknown");
    if (!loader) return undefined;
    void loader().then((url) => {
      iconUrlCache.set(iconName, url);
      if (!canceled) setIconUrl(url);
    });
    return () => {
      canceled = true;
    };
  }, [iconName]);

  return (
    <span
      className={className}
      aria-label={label}
      data-file-manager-file-type-icon="file"
    >
      {iconUrl ? (
        <img
          src={iconUrl}
          alt=""
          loading="lazy"
          decoding="async"
          className="size-full object-contain"
          draggable={false}
        />
      ) : (
        <span className="block size-full rounded-sm border border-line bg-panel-2" />
      )}
    </span>
  );
}

function iconNameForFile(fileName: string): string {
  const lowerName = fileName.toLowerCase();
  const extension = lowerName.includes(".")
    ? `.${lowerName.split(".").pop() ?? ""}`
    : "";
  return extensionIconMap[extension] ?? extensionIconMap[""] ?? "unknown";
}
