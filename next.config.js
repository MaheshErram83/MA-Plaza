/** @type {import('next').NextConfig} */
const nextConfig = {
  webpack: (config) => {
    config.externals = config.externals || [];
    config.externals.push("node-sqlite3-wasm");
    return config;
  },
};
module.exports = nextConfig;
