import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

/**
 * Docker 镜像策略的契约测试。
 *
 * Compose 面向普通用户,直接拉取发布到 GHCR 的 web 成品镜像。
 * Dockerfile 面向源码构建,继续通过 DOCKER_MIRROR 支持国内镜像源。
 */
describe("Docker 镜像策略", () => {
  const root = new URL("../../../", import.meta.url);
  const compose = readFileSync(new URL("docker-compose.yml", root), "utf8");
  const dockerfile = readFileSync(new URL("Dockerfile", root), "utf8");
  const envExample = readFileSync(new URL(".env.example", root), "utf8");
  const deploySh = readFileSync(new URL("scripts/deploy.sh", root), "utf8");
  const connectSh = readFileSync(new URL("assets/connect.sh", import.meta.url.replace(/src\/[^/]+$/, "")), "utf8");

  it("compose 直接拉取发布的 web 成品镜像", () => {
    expect(compose).toContain("image: ghcr.io/itxy1024/mediary-scout:latest");
    expect(compose).toContain("pull_policy: always");
  });

  it("compose 不强制要求仓库根目录存在 .env", () => {
    expect(compose).toMatch(/env_file:\s*\n\s*- path: \.env\s*\n\s*required: false/);
  });

  it("升级脚本拉取 web 成品镜像而不是调用 compose build", () => {
    expect(deploySh).toContain("docker compose pull web");
    expect(deploySh).not.toContain("docker compose build web");
  });

  it("Dockerfile 的 node 基础镜像走变量,且**两个阶段都声明了 ARG**", () => {
    // ARG 的作用域到 FROM 处结束。runner 阶段漏声明会让变量展开成空串 →
    // 那一层悄悄回落 Docker Hub,于是 builder 成功、runner 卡住。
    const froms = dockerfile.split("\n").filter((l) => l.startsWith("FROM "));
    expect(froms.length).toBeGreaterThanOrEqual(2);
    for (const f of froms) expect(f).toContain("DOCKER_MIRROR");
    expect(dockerfile.match(/^ARG DOCKER_MIRROR$/gm)?.length).toBe(froms.length);
  });

  it("手动源码构建的镜像源默认值为空", () => {
    expect(dockerfile).toContain("${DOCKER_MIRROR:+");
    expect(envExample).toMatch(/^DOCKER_MIRROR=$/m);
  });

  it("pansou 不受影响(它走 ghcr.io,墙内通常可直连)", () => {
    const line = compose.split("\n").find((l) => l.includes("pansou-web"));
    expect(line).toContain("ghcr.io");
    expect(line).not.toContain("DOCKER_MIRROR");
  });

  it("connect.sh 能识别 Docker Hub 报错并给出适用于当前 compose 的解法", () => {
    // 这三条是作者今晚实际遇到的原始报错。
    for (const pat of ["fetch anonymous token", "connection reset by peer", "resolve reference"]) {
      expect(connectSh, `诊断分支漏了 ${pat}`).toContain(pat);
    }
    expect(connectSh).toContain("registry-mirrors");
    expect(connectSh).toContain("不会改写当前 docker-compose.yml");
  });

  it("**生成产物 assets.gen.ts 与源文件同步**(我今晚漏过这一步)", () => {
    // /connect.sh 路由读的是 RAW_ASSETS(assets.gen.ts),**不是** assets/connect.sh。
    // 改了源文件不跑 `node scripts/generate-content.mjs`,线上拿到的还是旧脚本 ——
    // 而 tsc 和所有测试都是绿的,部署也"成功",只有 curl 线上才能发现。
    // 我今晚就是这么漏的:改完 connect.sh、提交、部署、自检通过,
    // 然后 curl 线上发现新内容一个字都没有。
    const gen = readFileSync(new URL("html/assets.gen.ts", import.meta.url), "utf8");
    for (const pat of ["registry-mirrors", "fetch anonymous token", "不会改写当前 docker-compose.yml"]) {
      expect(gen, `assets.gen.ts 缺 ${pat} —— 忘了跑 generate-content.mjs?`).toContain(pat);
    }
  });

  it(".env.example 与文档都列出多个镜像站", () => {
    // 公共镜像站会轮流失效。只给一个 = 那个站挂了用户就卡死。
    const deploy = readFileSync(new URL("docs/deploy.md", root), "utf8");
    for (const doc of [envExample, deploy]) {
      const hits = ["docker.1ms.run", "dockerproxy.net", "docker.m.daocloud.io", "hub.rat.dev"]
        .filter((m) => doc.includes(m));
      expect(hits.length).toBeGreaterThanOrEqual(4);
    }
  });
});
