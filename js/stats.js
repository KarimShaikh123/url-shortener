(function () {
  var tbody = document.getElementById("stats-body");
  var linksEl = document.getElementById("stat-links");
  var clicksEl = document.getElementById("stat-clicks");

  function escapeHtml(str) {
    var div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  fetch("./sample-stats.json")
    .then(function (res) {
      return res.json();
    })
    .then(function (payload) {
      var rows = "";
      var totalClicks = 0;
      payload.links.forEach(function (link) {
        totalClicks += link.total;
        var daily = link.daily
          .map(function (d) { return d.date.slice(5) + " " + d.count; })
          .join(", ");
        rows +=
          "<tr>" +
          "<td><code>" + escapeHtml(link.slug) + "</code></td>" +
          "<td class=\"target\">" + escapeHtml(link.url) + "</td>" +
          "<td>" + link.total + "</td>" +
          "<td>" + escapeHtml(daily) + "</td>" +
          "</tr>";
      });
      tbody.innerHTML = rows;
      linksEl.textContent = payload.links.length;
      clicksEl.textContent = totalClicks;
    })
    .catch(function () {
      tbody.innerHTML = "<tr><td colspan=\"4\">No stats yet.</td></tr>";
    });
})();
