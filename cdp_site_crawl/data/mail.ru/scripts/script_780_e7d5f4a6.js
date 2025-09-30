(async (iterator, size) => {
            const results = [];
            while (results.length < size) {
                const result = await iterator.next();
                if (result.done) {
                    break;
                }
                results.push(result.value);
            }
            return results;
        }
//# sourceURL=pptr:evaluateHandle;fastTransposeIteratorHandle%20(%2Fhome%2Fjlevitsky%2FDownloads%2Fcrawl%2FAgenticUse%2Fnode_modules%2Fpuppeteer-core%2Flib%2Fcjs%2Fpuppeteer%2Fcommon%2FHandleIterator.js%3A73%3A69)
)