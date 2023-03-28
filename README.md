# Liberland Blockchain API

This project houses the API to access the Liberland blockchain.

## Getting started

### Prerequisites

-   Compatible Node.js and NPM versions. See the `engines` property of the `package.json` file for which versions of each you should be running.
    > If you're not running those versions, you can use version managers such as [`nvm`](https://github.com/nvm-sh/nvm) or [`n`](https://github.com/tj/n) to set up those versions.
-   A fully set-up [Substrate blockchain project](https://github.com/liberland/liberland_substrate).

### Installation

Install all the necessary packages by running:

```bash
npm i
```

### Running

To run the development server:

```bash
npm start
```

Once loaded, the website should be available on port `8060` of your local machine. For example, http://localhost:8050.
The blockchain (deployed on your local machine) should be working well enough to function as well.
