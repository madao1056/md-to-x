import Cocoa

guard CommandLine.arguments.count > 1 else {
  fputs("Usage: clipboard <html-file>\n", stderr)
  exit(1)
}

let path = CommandLine.arguments[1]
guard let data = FileManager.default.contents(atPath: path),
      let html = String(data: data, encoding: .utf8) else {
  fputs("Error: cannot read \(path)\n", stderr)
  exit(1)
}

let pb = NSPasteboard.general
pb.clearContents()
pb.setString(html, forType: .html)
pb.setString(html, forType: .string)
print("Copied to clipboard (HTML)")
