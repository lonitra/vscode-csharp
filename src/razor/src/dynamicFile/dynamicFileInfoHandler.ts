/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { DocumentUri } from 'vscode-languageclient/node';
import { UriConverter } from '../../../lsptoolshost/uriConverter';
import { RazorDocumentManager } from '../document/razorDocumentManager';
import { RazorLogger } from '../razorLogger';
import { ProvideDynamicFileParams } from './provideDynamicFileParams';
import { ProvideDynamicFileResponse } from './provideDynamicFileResponse';
import { RemoveDynamicFileParams } from './removeDynamicFileParams';

// Handles Razor generated doc communication between the Roslyn workspace and Razor.
// didChange behavior for Razor generated docs is handled in the RazorDocumentManager.
export class DynamicFileInfoHandler {
    public static readonly provideDynamicFileInfoCommand = 'razor.provideDynamicFileInfo';
    public static readonly removeDynamicFileInfoCommand = 'razor.removeDynamicFileInfo';

    constructor(private readonly documentManager: RazorDocumentManager, private readonly logger: RazorLogger) {}

    public register() {
        vscode.commands.registerCommand(
            DynamicFileInfoHandler.provideDynamicFileInfoCommand,
            async (request: ProvideDynamicFileParams) => {
                return this.provideDynamicFileInfo(request);
            }
        );
        vscode.commands.registerCommand(
            DynamicFileInfoHandler.removeDynamicFileInfoCommand,
            async (request: RemoveDynamicFileParams) => {
                this.removeDynamicFileInfo(request);
            }
        );
    }

    // Given Razor document URIs, returns associated generated doc URIs
    private async provideDynamicFileInfo(request: ProvideDynamicFileParams): Promise<ProvideDynamicFileResponse> {
        const uris = request.razorFiles;
        const virtualUris = new Array<DocumentUri | null>();
        try {
            for (const razorDocumentUri of uris) {
                const vscodeUri = vscode.Uri.parse('file:' + razorDocumentUri, true);
                const razorDocument = await this.documentManager.getDocument(vscodeUri);
                if (razorDocument === undefined) {
                    virtualUris.push(null);
                    this.logger.logWarning(
                        `Could not find Razor document ${razorDocumentUri}; adding null as a placeholder in URI array.`
                    );
                } else {
                    // Retrieve generated doc URIs for each Razor URI we are given
                    const virtualCsharpUri = UriConverter.serialize(razorDocument.csharpDocument.uri);
                    virtualUris.push(virtualCsharpUri);
                }
            }

            this.documentManager.roslynActivated = true;

            // Normally we start receiving dynamic info after Razor is initialized, but if the user had a .razor file open
            // when they started VS Code, the order is the other way around. This no-ops if Razor is already initialized.
            await this.documentManager.ensureRazorInitialized();
        } catch (error) {
            this.logger.logWarning(`${DynamicFileInfoHandler.provideDynamicFileInfoCommand} failed with ${error}`);
        }

        return new ProvideDynamicFileResponse(virtualUris);
    }

    private async removeDynamicFileInfo(request: RemoveDynamicFileParams) {
        try {
            const uris = request.razorFiles;
            for (const razorDocumentUri of uris) {
                const vscodeUri = vscode.Uri.parse('file:' + razorDocumentUri, true);
                if (this.documentManager.isRazorDocumentOpenInCSharpWorkspace(vscodeUri)) {
                    this.documentManager.didCloseRazorCSharpDocument(vscodeUri);
                }
            }
        } catch (error) {
            this.logger.logWarning(`${DynamicFileInfoHandler.removeDynamicFileInfoCommand} failed with ${error}`);
        }
    }
}
