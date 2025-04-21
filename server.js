const express = require('express');
const fs = require('fs');
const app = express();
const port = 9000;

let capturedUrls = [];

app.get('/update', (req, res) => {
    const serviceUrl = req.query.service_url; // Get URL from query param
    if (!serviceUrl) {
        return res.status(400).send('Missing service_url parameter');
    }

    capturedUrls.push(serviceUrl);
    fs.appendFileSync('captured_urls.txt', serviceUrl + '\n');

    console.log(`Captured URL: ${serviceUrl}`);
    res.send(`Captured: ${serviceUrl}`);
});

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});
