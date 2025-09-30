(() => {
                let content = '';
                for (const node of document.childNodes) {
                    switch (node) {
                        case document.documentElement:
                            content += document.documentElement.outerHTML;
                            break;
                        default:
                            content += new XMLSerializer().serializeToString(node);
                            break;
                    }
                }
                return content;
            }
//# sourceURL=pptr:;CdpFrame.%3Canonymous%3E%20(%2Fhome%2Fjlevitsky%2FDownloads%2Fcrawl%2FAgenticUse%2Fnode_modules%2Fpuppeteer-core%2Flib%2Fcjs%2Fpuppeteer%2Futil%2Fdecorators.js%3A109%3A27)
)