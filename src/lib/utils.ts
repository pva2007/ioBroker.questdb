import type { DatapointCustomConfig } from './types';

export function sanitizeId(id: string): string {
    return id.replace(/\./g, '_').replace(/[^a-zA-Z0-9_]/g, '');
}

export function getCustomConfigFromObj(
    obj: ioBroker.Object | null | undefined,
    namespace: string,
): DatapointCustomConfig | null {
    if (!obj || obj.type !== 'state') return null;
    const stateObj = obj as ioBroker.StateObject;
    const custom = stateObj.common?.custom?.[namespace] as Record<string, unknown> | undefined;
    if (!custom?.enabled) return null;
    return {
        enabled: true,
        alias: typeof custom.alias === 'string' ? custom.alias : '',
        debounceMs: typeof custom.debounceMs === 'number' ? custom.debounceMs : -1,
    };
}
