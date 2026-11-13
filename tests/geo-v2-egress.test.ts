import { describe, expect, it } from "vitest";
import { isPublicIpv4, parseAllowedConnect } from "../src/geo/rendering/geo-egress.js";

describe("isolated HTTPS egress admission", () => {
  it.each(["127.0.0.1", "10.1.2.3", "172.16.1.1", "192.168.1.1", "169.254.169.254",
    "100.100.100.100", "0.0.0.0", "192.0.2.1", "198.18.0.1", "198.51.100.1",
    "203.0.113.5", "224.0.0.1", "255.255.255.255", "::1", "[::1]", "not-an-ip"])
  ("blocks non-public address %s", (ip) => expect(isPublicIpv4(ip)).toBe(false));

  it("recognizes public IPv4 addresses", () => {
    expect(isPublicIpv4("8.8.8.8")).toBe(true);
    expect(isPublicIpv4("1.1.1.1")).toBe(true);
  });

  it("allows CONNECT only to verified hostname on 443", () => {
    expect(parseAllowedConnect("CONNECT example.com:443 HTTP/1.1", "example.com")).toBe("example.com");
    for (const line of ["CONNECT example.com:80 HTTP/1.1", "CONNECT attacker.com:443 HTTP/1.1",
      "GET https://example.com/ HTTP/1.1", "CONNECT 127.0.0.1:443 HTTP/1.1",
      "CONNECT example.com:443 HTTP/2.0", "CONNECT sub.example.com:443 HTTP/1.1"]) {
      expect(() => parseAllowedConnect(line, "example.com")).toThrow();
    }
  });
});
