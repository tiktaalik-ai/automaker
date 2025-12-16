"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import {
  GitBranch,
  Plus,
  Trash2,
  MoreHorizontal,
  RefreshCw,
  GitCommit,
  GitPullRequest,
  ExternalLink,
  ChevronDown,
  Download,
  GitBranchPlus,
  Check,
  Search,
} from "lucide-react";
import { useAppStore } from "@/store/app-store";
import { getElectronAPI } from "@/lib/electron";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface WorktreeInfo {
  path: string;
  branch: string;
  isMain: boolean;
  hasChanges?: boolean;
  changedFilesCount?: number;
}

interface BranchInfo {
  name: string;
  isCurrent: boolean;
  isRemote: boolean;
}

interface WorktreeSelectorProps {
  projectPath: string;
  onCreateWorktree: () => void;
  onDeleteWorktree: (worktree: WorktreeInfo) => void;
  onCommit: (worktree: WorktreeInfo) => void;
  onCreatePR: (worktree: WorktreeInfo) => void;
  onCreateBranch: (worktree: WorktreeInfo) => void;
}

export function WorktreeSelector({
  projectPath,
  onCreateWorktree,
  onDeleteWorktree,
  onCommit,
  onCreatePR,
  onCreateBranch,
}: WorktreeSelectorProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [isPulling, setIsPulling] = useState(false);
  const [isSwitching, setIsSwitching] = useState(false);
  const [worktrees, setWorktrees] = useState<WorktreeInfo[]>([]);
  const [branches, setBranches] = useState<BranchInfo[]>([]);
  const [isLoadingBranches, setIsLoadingBranches] = useState(false);
  const [branchFilter, setBranchFilter] = useState("");
  const currentWorktree = useAppStore((s) => s.getCurrentWorktree(projectPath));
  const setCurrentWorktree = useAppStore((s) => s.setCurrentWorktree);
  const setWorktreesInStore = useAppStore((s) => s.setWorktrees);

  const fetchWorktrees = useCallback(async () => {
    if (!projectPath) return;
    setIsLoading(true);
    try {
      const api = getElectronAPI();
      if (!api?.worktree?.listAll) {
        console.warn("Worktree API not available");
        return;
      }
      const result = await api.worktree.listAll(projectPath, true);
      if (result.success && result.worktrees) {
        setWorktrees(result.worktrees);
        setWorktreesInStore(projectPath, result.worktrees);
      }
    } catch (error) {
      console.error("Failed to fetch worktrees:", error);
    } finally {
      setIsLoading(false);
    }
  }, [projectPath, setWorktreesInStore]);

  const fetchBranches = useCallback(async (worktreePath: string) => {
    setIsLoadingBranches(true);
    try {
      const api = getElectronAPI();
      if (!api?.worktree?.listBranches) {
        console.warn("List branches API not available");
        return;
      }
      const result = await api.worktree.listBranches(worktreePath);
      if (result.success && result.result) {
        setBranches(result.result.branches);
      }
    } catch (error) {
      console.error("Failed to fetch branches:", error);
    } finally {
      setIsLoadingBranches(false);
    }
  }, []);

  useEffect(() => {
    fetchWorktrees();
  }, [fetchWorktrees]);

  const handleSelectWorktree = (worktree: WorktreeInfo) => {
    setCurrentWorktree(projectPath, worktree.isMain ? null : worktree.path);
  };

  const handleSwitchBranch = async (worktree: WorktreeInfo, branchName: string) => {
    if (isSwitching || branchName === worktree.branch) return;
    setIsSwitching(true);
    try {
      const api = getElectronAPI();
      if (!api?.worktree?.switchBranch) {
        toast.error("Switch branch API not available");
        return;
      }
      const result = await api.worktree.switchBranch(worktree.path, branchName);
      if (result.success && result.result) {
        toast.success(result.result.message);
        // Refresh worktrees to get updated branch info
        fetchWorktrees();
      } else {
        toast.error(result.error || "Failed to switch branch");
      }
    } catch (error) {
      console.error("Switch branch failed:", error);
      toast.error("Failed to switch branch");
    } finally {
      setIsSwitching(false);
    }
  };

  const handlePull = async (worktree: WorktreeInfo) => {
    if (isPulling) return;
    setIsPulling(true);
    try {
      const api = getElectronAPI();
      if (!api?.worktree?.pull) {
        toast.error("Pull API not available");
        return;
      }
      const result = await api.worktree.pull(worktree.path);
      if (result.success && result.result) {
        toast.success(result.result.message);
        // Refresh worktrees to get updated status
        fetchWorktrees();
      } else {
        toast.error(result.error || "Failed to pull latest changes");
      }
    } catch (error) {
      console.error("Pull failed:", error);
      toast.error("Failed to pull latest changes");
    } finally {
      setIsPulling(false);
    }
  };

  const selectedWorktree =
    worktrees.find((w) =>
      currentWorktree ? w.path === currentWorktree : w.isMain
    ) || worktrees.find((w) => w.isMain);

  if (worktrees.length === 0 && !isLoading) {
    // No git repo or loading
    return null;
  }

  // Render a worktree tab with branch selector (for main) and actions dropdown
  const renderWorktreeTab = (worktree: WorktreeInfo) => {
    const isSelected = selectedWorktree?.path === worktree.path;

    return (
      <div key={worktree.path} className="flex items-center">
        {/* Branch name - clickable dropdown for main repo to switch branches */}
        {worktree.isMain ? (
          <DropdownMenu onOpenChange={(open) => {
            if (open) {
              // Select this worktree when opening the dropdown
              if (!isSelected) {
                handleSelectWorktree(worktree);
              }
              fetchBranches(worktree.path);
              setBranchFilter("");
            }
          }}>
            <DropdownMenuTrigger asChild>
              <Button
                variant={isSelected ? "default" : "ghost"}
                size="sm"
                className={cn(
                  "h-7 px-3 text-xs font-mono gap-1.5 rounded-r-none",
                  isSelected && "bg-primary text-primary-foreground",
                  !isSelected && "hover:bg-secondary"
                )}
              >
                <GitBranch className="w-3 h-3" />
                {worktree.branch}
                {worktree.hasChanges && (
                  <span className="inline-flex items-center justify-center h-4 min-w-[1rem] px-1 text-[10px] font-medium rounded bg-background/80 text-foreground border border-border">
                    {worktree.changedFilesCount}
                  </span>
                )}
                <ChevronDown className="w-3 h-3 ml-0.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-64">
              {/* Search input */}
              <div className="px-2 py-1.5">
                <div className="relative">
                  <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                  <Input
                    placeholder="Filter branches..."
                    value={branchFilter}
                    onChange={(e) => setBranchFilter(e.target.value)}
                    onKeyDown={(e) => e.stopPropagation()}
                    onKeyUp={(e) => e.stopPropagation()}
                    onKeyPress={(e) => e.stopPropagation()}
                    className="h-7 pl-7 text-xs"
                    autoFocus
                  />
                </div>
              </div>
              <DropdownMenuSeparator />
              <div className="max-h-[250px] overflow-y-auto">
                {isLoadingBranches ? (
                  <DropdownMenuItem disabled className="text-xs">
                    <RefreshCw className="w-3.5 h-3.5 mr-2 animate-spin" />
                    Loading branches...
                  </DropdownMenuItem>
                ) : (() => {
                  const filteredBranches = branches.filter((b) =>
                    b.name.toLowerCase().includes(branchFilter.toLowerCase())
                  );
                  if (filteredBranches.length === 0) {
                    return (
                      <DropdownMenuItem disabled className="text-xs">
                        {branchFilter ? "No matching branches" : "No branches found"}
                      </DropdownMenuItem>
                    );
                  }
                  return filteredBranches.map((branch) => (
                    <DropdownMenuItem
                      key={branch.name}
                      onClick={() => handleSwitchBranch(worktree, branch.name)}
                      disabled={isSwitching || branch.name === worktree.branch}
                      className="text-xs font-mono"
                    >
                      {branch.name === worktree.branch ? (
                        <Check className="w-3.5 h-3.5 mr-2 flex-shrink-0" />
                      ) : (
                        <span className="w-3.5 mr-2 flex-shrink-0" />
                      )}
                      <span className="truncate">{branch.name}</span>
                    </DropdownMenuItem>
                  ));
                })()}
              </div>
              <DropdownMenuSeparator />
              {worktree.hasChanges && (
                <DropdownMenuItem
                  onClick={() => onCommit(worktree)}
                  className="text-xs"
                >
                  <GitCommit className="w-3.5 h-3.5 mr-2" />
                  Commit Changes ({worktree.changedFilesCount} file{worktree.changedFilesCount !== 1 ? "s" : ""})
                </DropdownMenuItem>
              )}
              <DropdownMenuItem
                onClick={() => onCreateBranch(worktree)}
                className="text-xs"
              >
                <GitBranchPlus className="w-3.5 h-3.5 mr-2" />
                Create New Branch...
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          // Non-main worktrees - just show branch name (worktrees are tied to branches)
          <Button
            variant={isSelected ? "default" : "ghost"}
            size="sm"
            className={cn(
              "h-7 px-3 text-xs font-mono gap-1.5 rounded-r-none",
              isSelected && "bg-primary text-primary-foreground",
              !isSelected && "hover:bg-secondary"
            )}
            onClick={() => handleSelectWorktree(worktree)}
          >
            {worktree.branch}
            {worktree.hasChanges && (
              <span className="inline-flex items-center justify-center h-4 min-w-[1rem] px-1 text-[10px] font-medium rounded bg-background/80 text-foreground border border-border">
                {worktree.changedFilesCount}
              </span>
            )}
          </Button>
        )}

        {/* Actions dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant={isSelected ? "default" : "ghost"}
              size="sm"
              className={cn(
                "h-7 w-6 p-0 rounded-l-none",
                isSelected && "bg-primary text-primary-foreground",
                !isSelected && "hover:bg-secondary"
              )}
            >
              <MoreHorizontal className="w-3 h-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-48">
            {/* Pull latest changes */}
            <DropdownMenuItem
              onClick={() => handlePull(worktree)}
              disabled={isPulling}
              className="text-xs"
            >
              <Download className={cn("w-3.5 h-3.5 mr-2", isPulling && "animate-pulse")} />
              {isPulling ? "Pulling..." : "Pull Latest"}
            </DropdownMenuItem>
            {/* Create new branch - only for main repo */}
            {worktree.isMain && (
              <DropdownMenuItem
                onClick={() => onCreateBranch(worktree)}
                className="text-xs"
              >
                <GitBranchPlus className="w-3.5 h-3.5 mr-2" />
                New Branch
              </DropdownMenuItem>
            )}
            {worktree.hasChanges && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => onCommit(worktree)}
                  className="text-xs"
                >
                  <GitCommit className="w-3.5 h-3.5 mr-2" />
                  Commit Changes
                </DropdownMenuItem>
              </>
            )}
            {/* Show PR option if not on main branch, or if on main with changes */}
            {(worktree.branch !== "main" || worktree.hasChanges) && (
              <DropdownMenuItem
                onClick={() => onCreatePR(worktree)}
                className="text-xs"
              >
                <GitPullRequest className="w-3.5 h-3.5 mr-2" />
                Create Pull Request
              </DropdownMenuItem>
            )}
            {/* Only show delete for non-main worktrees */}
            {!worktree.isMain && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => onDeleteWorktree(worktree)}
                  className="text-xs text-destructive focus:text-destructive"
                >
                  <Trash2 className="w-3.5 h-3.5 mr-2" />
                  Delete Worktree
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    );
  };

  return (
    <div className="flex items-center gap-2 px-4 py-2 border-b border-border bg-glass/50 backdrop-blur-sm">
      <GitBranch className="w-4 h-4 text-muted-foreground" />
      <span className="text-sm text-muted-foreground mr-2">Branch:</span>

      {/* Worktree Tabs */}
      <div className="flex items-center gap-1 flex-wrap">
        {worktrees.map((worktree) => renderWorktreeTab(worktree))}

        {/* Add Worktree Button */}
        <Button
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
          onClick={onCreateWorktree}
          title="Create new worktree"
        >
          <Plus className="w-4 h-4" />
        </Button>

        {/* Refresh Button */}
        <Button
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
          onClick={fetchWorktrees}
          disabled={isLoading}
          title="Refresh worktrees"
        >
          <RefreshCw className={cn("w-3.5 h-3.5", isLoading && "animate-spin")} />
        </Button>
      </div>
    </div>
  );
}
