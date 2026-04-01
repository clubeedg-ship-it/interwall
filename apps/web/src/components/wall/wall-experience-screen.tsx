import type {
    WallInventoryViewModel,
    WallScannerState,
} from '@interwall/shared';

import {
    ScannerCommandSurface,
    type ScannerCommandSurfaceProps,
} from './scanner-command-surface';
import {
    WallCanvasSection,
    type WallCanvasSectionProps,
} from './wall-canvas-section';

export interface WallExperienceScreenProps {
    wall: WallInventoryViewModel;
    scanner: WallScannerState;
}

export function WallExperienceScreen({
    wall,
    scanner,
}: WallExperienceScreenProps): JSX.Element {
    const wallCanvasProps: WallCanvasSectionProps = { wall };
    const scannerSurfaceProps: ScannerCommandSurfaceProps = { scanner };

    return (
        <div className="flex w-full flex-col gap-6 xl:flex-row">
            <WallCanvasSection {...wallCanvasProps} />
            <ScannerCommandSurface {...scannerSurfaceProps} />
        </div>
    );
}
