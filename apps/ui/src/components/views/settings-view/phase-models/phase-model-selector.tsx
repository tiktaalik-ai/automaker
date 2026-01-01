import * as React from 'react';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/store/app-store';
import type { ModelAlias, CursorModelId } from '@automaker/types';
import { stripProviderPrefix } from '@automaker/types';
import { CLAUDE_MODELS, CURSOR_MODELS } from '@/components/views/board-view/shared/model-constants';
import { Check, ChevronsUpDown, Star, Brain, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

interface PhaseModelSelectorProps {
  label: string;
  description: string;
  value: ModelAlias | CursorModelId;
  onChange: (model: ModelAlias | CursorModelId) => void;
}

export function PhaseModelSelector({
  label,
  description,
  value,
  onChange,
}: PhaseModelSelectorProps) {
  const [open, setOpen] = React.useState(false);
  const { enabledCursorModels, favoriteModels, toggleFavoriteModel } = useAppStore();

  // Filter Cursor models to only show enabled ones
  const availableCursorModels = CURSOR_MODELS.filter((model) => {
    const cursorId = stripProviderPrefix(model.id) as CursorModelId;
    return enabledCursorModels.includes(cursorId);
  });

  // Helper to find current selected model details
  const currentModel = React.useMemo(() => {
    const claudeModel = CLAUDE_MODELS.find((m) => m.id === value);
    if (claudeModel) return { ...claudeModel, icon: Brain };

    const cursorModel = availableCursorModels.find((m) => stripProviderPrefix(m.id) === value);
    if (cursorModel) return { ...cursorModel, icon: Sparkles };

    return null;
  }, [value, availableCursorModels]);

  // Group models
  const { favorites, claude, cursor } = React.useMemo(() => {
    const favs: typeof CLAUDE_MODELS = [];
    const cModels: typeof CLAUDE_MODELS = [];
    const curModels: typeof CURSOR_MODELS = [];

    // Process Claude Models
    CLAUDE_MODELS.forEach((model) => {
      if (favoriteModels.includes(model.id)) {
        favs.push(model);
      } else {
        cModels.push(model);
      }
    });

    // Process Cursor Models
    availableCursorModels.forEach((model) => {
      if (favoriteModels.includes(model.id)) {
        favs.push(model);
      } else {
        curModels.push(model);
      }
    });

    return { favorites: favs, claude: cModels, cursor: curModels };
  }, [favoriteModels, availableCursorModels]);

  const renderModelItem = (model: (typeof CLAUDE_MODELS)[0], type: 'claude' | 'cursor') => {
    const isClaude = type === 'claude';
    // For Claude, value is model.id. For Cursor, it's stripped ID.
    const modelValue = isClaude ? model.id : stripProviderPrefix(model.id);
    const isSelected = value === modelValue;
    const isFavorite = favoriteModels.includes(model.id);
    const Icon = isClaude ? Brain : Sparkles;

    return (
      <CommandItem
        key={model.id}
        value={model.label}
        onSelect={() => {
          onChange(modelValue as ModelAlias | CursorModelId);
          setOpen(false);
        }}
        className="group flex items-center justify-between py-2"
      >
        <div className="flex items-center gap-3 overflow-hidden">
          <Icon
            className={cn(
              'h-4 w-4 shrink-0',
              isSelected ? 'text-primary' : 'text-muted-foreground'
            )}
          />
          <div className="flex flex-col truncate">
            <span className={cn('truncate font-medium', isSelected && 'text-primary')}>
              {model.label}
            </span>
            <span className="truncate text-xs text-muted-foreground">{model.description}</span>
          </div>
        </div>

        <div className="flex items-center gap-1 ml-2">
          <Button
            variant="ghost"
            size="icon"
            className={cn(
              'h-6 w-6 hover:bg-transparent hover:text-yellow-500 focus:ring-0',
              isFavorite
                ? 'text-yellow-500 opacity-100'
                : 'opacity-0 group-hover:opacity-100 text-muted-foreground'
            )}
            onClick={(e) => {
              e.stopPropagation();
              toggleFavoriteModel(model.id);
            }}
          >
            <Star className={cn('h-3.5 w-3.5', isFavorite && 'fill-current')} />
          </Button>
          {isSelected && <Check className="h-4 w-4 text-primary shrink-0" />}
        </div>
      </CommandItem>
    );
  };

  return (
    <div
      className={cn(
        'flex items-center justify-between p-4 rounded-xl',
        'bg-accent/20 border border-border/30',
        'hover:bg-accent/30 transition-colors'
      )}
    >
      {/* Label and Description */}
      <div className="flex-1 pr-4">
        <h4 className="text-sm font-medium text-foreground">{label}</h4>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>

      {/* Model Selection Popover */}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="w-[260px] justify-between h-9 px-3 bg-background/50 border-border/50 hover:bg-background/80 hover:text-foreground"
          >
            <div className="flex items-center gap-2 truncate">
              {currentModel?.icon && (
                <currentModel.icon className="h-4 w-4 text-muted-foreground/70" />
              )}
              <span className="truncate text-sm">{currentModel?.label || 'Select model...'}</span>
            </div>
            <ChevronsUpDown className="ml-2 h-3.5 w-3.5 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[320px] p-0" align="end">
          <Command>
            <CommandInput placeholder="Search models..." />
            <CommandList className="max-h-[300px]">
              <CommandEmpty>No model found.</CommandEmpty>

              {favorites.length > 0 && (
                <>
                  <CommandGroup heading="Favorites">
                    {favorites.map((model) =>
                      renderModelItem(model, model.provider === 'claude' ? 'claude' : 'cursor')
                    )}
                  </CommandGroup>
                  <CommandSeparator />
                </>
              )}

              {claude.length > 0 && (
                <CommandGroup heading="Claude Models">
                  {claude.map((model) => renderModelItem(model, 'claude'))}
                </CommandGroup>
              )}

              {cursor.length > 0 && (
                <CommandGroup heading="Cursor Models">
                  {cursor.map((model) => renderModelItem(model, 'cursor'))}
                </CommandGroup>
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}
