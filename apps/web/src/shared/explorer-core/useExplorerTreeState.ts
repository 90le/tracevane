import * as React from "react";
import { explorerAncestorDirectoryKeys } from "./path";
import type { ExplorerLocation, ExplorerNodeKey, ExplorerTreeState, ExplorerTreeStateOptions } from "./types";

function toSet(keys?: Iterable<ExplorerNodeKey>): Set<ExplorerNodeKey> {
  return new Set(keys ?? []);
}

export function useExplorerTreeState(options: ExplorerTreeStateOptions = {}): ExplorerTreeState {
  const initialExpanded = React.useMemo(() => toSet(options.initialExpandedKeys), [options.initialExpandedKeys]);
  const initialSelected = React.useMemo(() => toSet(options.initialSelectedKeys), [options.initialSelectedKeys]);
  const [expandedKeys, setExpandedKeysState] = React.useState<Set<ExplorerNodeKey>>(initialExpanded);
  const [selectedKeys, setSelectedKeys] = React.useState<Set<ExplorerNodeKey>>(initialSelected);
  const [activeKey, setActiveKey] = React.useState<ExplorerNodeKey | null>(options.initialActiveKey ?? null);

  const expand = React.useCallback((key: ExplorerNodeKey) => {
    setExpandedKeysState((current) => new Set(current).add(key));
  }, []);

  const collapse = React.useCallback((key: ExplorerNodeKey) => {
    setExpandedKeysState((current) => {
      const next = new Set(current);
      next.delete(key);
      return next;
    });
  }, []);

  const toggleExpanded = React.useCallback((key: ExplorerNodeKey) => {
    setExpandedKeysState((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const setExpandedKeys = React.useCallback((keys: Iterable<ExplorerNodeKey>) => {
    setExpandedKeysState(new Set(keys));
  }, []);

  const select = React.useCallback((key: ExplorerNodeKey, selectOptions?: { additive?: boolean }) => {
    setSelectedKeys((current) => {
      if (!selectOptions?.additive) return new Set([key]);
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
    setActiveKey(key);
  }, []);

  const clearSelection = React.useCallback(() => {
    setSelectedKeys(new Set());
    setActiveKey(null);
  }, []);

  const revealPath = React.useCallback((location: ExplorerLocation) => {
    setExpandedKeysState((current) => {
      const next = new Set(current);
      for (const key of explorerAncestorDirectoryKeys(location)) next.add(key);
      return next;
    });
  }, []);

  const reset = React.useCallback(() => {
    setExpandedKeysState(new Set(initialExpanded));
    setSelectedKeys(new Set(initialSelected));
    setActiveKey(options.initialActiveKey ?? null);
  }, [initialExpanded, initialSelected, options.initialActiveKey]);

  return {
    expandedKeys,
    selectedKeys,
    activeKey,
    isExpanded: React.useCallback((key) => expandedKeys.has(key), [expandedKeys]),
    isSelected: React.useCallback((key) => selectedKeys.has(key), [selectedKeys]),
    expand,
    collapse,
    toggleExpanded,
    setExpandedKeys,
    select,
    clearSelection,
    setActiveKey,
    revealPath,
    reset,
  };
}
