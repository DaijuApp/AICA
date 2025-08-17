function parseMarkdown(text) {
    if (!text) return "";
    let html = text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
    // unordered lists
    html = html.replace(/(^|\n)([-*] .+(?:\n[-*] .+)*)/g, function(_, p1, block) {
        const items = block.split(/\n/).map(line => '<li>' + line.substring(2).trim() + '</li>').join('');
        return p1 + '<ul>' + items + '</ul>';
    });
    html = html.replace(/^### (.*)$/gm, '<h3>$1</h3>')
               .replace(/^## (.*)$/gm, '<h2>$1</h2>')
               .replace(/^# (.*)$/gm, '<h1>$1</h1>');
    html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
               .replace(/\*(.+?)\*/g, '<em>$1</em>');
    html = html.replace(/\n/g, '<br>');
    return html;
}
window.parseMarkdown = parseMarkdown;
