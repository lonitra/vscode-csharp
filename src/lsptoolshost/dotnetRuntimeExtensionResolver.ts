/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as path from 'path';
import * as vscode from 'vscode';
import { HostExecutableInformation } from "../shared/constants/HostExecutableInformation";
import { IHostExecutableResolver } from "../shared/constants/IHostExecutableResolver";
import { getServerPath } from "../lsptoolshost/roslynLanguageServer";
import { PlatformInformation } from "../shared/platform";
import { Options } from "../shared/options";
import { existsSync } from 'fs';
import { CSharpExtensionId } from '../constants/CSharpExtensionId';

export const DotNetRuntimeVersion = '7.0';

interface IDotnetAcquireResult {
    dotnetPath: string;
}

/**
 * Resolves the dotnet runtime from given options and the dotnet runtime VSCode extension.
 */
export class DotnetRuntimeExtensionResolver implements IHostExecutableResolver {
    constructor(private platformInfo: PlatformInformation) { }

    private hostInfo: HostExecutableInformation | undefined;

    async getHostExecutableInfo(options: Options): Promise<HostExecutableInformation> {
        let dotnetRuntimePath = options.commonOptions.dotnetPath;
        const serverPath = getServerPath(options, this.platformInfo);
        if (!dotnetRuntimePath)
        {
            let dotnetInfo = await this.acquireDotNetProcessDependencies(serverPath);
            dotnetRuntimePath = path.dirname(dotnetInfo.path);
        }

        // TODO need exe?
        const dotnetExecutableName = this.platformInfo.isWindows() ? 'dotnet.exe' : 'dotnet';
        const dotnetExecutablePath = path.join(dotnetRuntimePath, dotnetExecutableName);
        if (!existsSync(dotnetExecutablePath)) {
            throw new Error(`Cannot find dotnet path '${dotnetExecutablePath}'`);
        }

        return {
            version: "", /* We don't need to know the version - we've already downloaded the correct one */
            path: dotnetExecutablePath,
            env: process.env,
        };
    }

    /**
     * Acquires the .NET runtime if it is not already present.
     * @returns The path to the .NET runtime
     */
    private async acquireRuntime(): Promise<HostExecutableInformation> {
        if (this.hostInfo) {
            return this.hostInfo;
        }

        let status = await vscode.commands.executeCommand<IDotnetAcquireResult>('dotnet.acquireStatus', {
            version: DotNetRuntimeVersion,
            requestingExtensionId: CSharpExtensionId,
        });
        if (status === undefined) {
            await vscode.commands.executeCommand('dotnet.showAcquisitionLog');

            status = await vscode.commands.executeCommand<IDotnetAcquireResult>('dotnet.acquire', {
                version: DotNetRuntimeVersion,
                requestingExtensionId: CSharpExtensionId,
            });
            if (!status?.dotnetPath) {
                throw new Error('Could not resolve the dotnet path!');
            }
        }

        return (this.hostInfo = {
            version: DotNetRuntimeVersion,
            path: status.dotnetPath,
            env: process.env
        });
    }

    /**
     * Acquires the .NET runtime and any other dependencies required to spawn a particular .NET executable.
     * @param path The path to the entrypoint assembly. Typically a .dll.
     * @returns The path to the `dotnet` command to use to spawn the process.
     */
    private async acquireDotNetProcessDependencies(path: string) {
        const dotnetPath = await this.acquireRuntime();

        const args = [path];
        // This will install any missing Linux dependencies.
        await vscode.commands.executeCommand('dotnet.ensureDotnetDependencies', { command: dotnetPath, arguments: args });

        return dotnetPath;
    }
}



