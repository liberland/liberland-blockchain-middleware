# Liberland Blockchain API

This project houses the API to access the Liberland blockchain.

## Getting started

### Prerequisites

-   Compatible Node.js and NPM versions. See the `engines` property of the `package.json` file for which versions of each you should be running.
    > If you're not running those versions, you can use version managers such as [`nvm`](https://github.com/nvm-sh/nvm) or [`n`](https://github.com/tj/n) to set up those versions.

### Installation

Install all the necessary packages by running:

```bash
npm i
```

#### Generating PDF

To generate PDF files, you'll need to install [Wkhtmltopdf](https://wkhtmltopdf.org/). This tool is essential for converting HTML pages to PDF format.

-   **On Linux:**
    Run the following command in your terminal:
    ```bash
    sudo apt-get -y install wkhtmltopdf
    ```

#### Using webhooks

In order to sign webhooks messages, you need to generate keys using these two commands (keys are not committed):

```bash
openssl genpkey -algorithm RSA -out private_key.pem -pkeyopt rsa_keygen_bits:2048
```

```bash
openssl rsa -pubout -in private_key.pem -out public_key.pem
```

Share public_key with any API consumers that need to verify the API results

### Running

To run the development server:

```bash
npm start
```

Once loaded, the website should be available on port `8060` of your local machine. For example, http://localhost:8060.
The blockchain, centralized API (deployed on your local machine or connected to testnet) should be setup as well.

##Deployment

set environment in package.json
pm2 start npm --name staging-middleware -- start
