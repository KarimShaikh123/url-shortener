(function () {
  var tbody = document.getElementById("stats-body");
  var linksEl = document.getElementById("stat-links");
  var clicksEl = document.getElementById("stat-clicks");
  var weekEl = document.getElementById("stat-week");

  function escapeHtml(str) {
    var div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  var MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  function formatDay(iso) {
    return parseInt(iso.slice(8, 10), 10) + " " + MONTHS[parseInt(iso.slice(5, 7), 10) - 1];
  }

  function daysFor(daily) {
    return daily
      .map(function (d) {
        return (
          '<div class="day" title="' + d.date + '">' +
          "<strong>" + d.count + "</strong>" +
          "<span>" + formatDay(d.date) + "</span>" +
          "</div>"
        );
      })
      .join("");
  }

  fetch("./sample-stats.json")
    .then(function (res) {
      return res.json();
    })
    .then(function (payload) {
      var rows = "";
      var totalClicks = 0;
      var weekClicks = 0;
      var weekAgo = Date.now() - 7 * 24 * 3600 * 1000;

      payload.links.forEach(function (link) {
        totalClicks += link.total;
        link.daily.forEach(function (d) {
          if (new Date(d.date + "T00:00:00Z").getTime() >= weekAgo) {
            weekClicks += d.count;
          }
        });
        rows +=
          "<tr>" +
          "<td><code>" + escapeHtml(link.slug) + "</code></td>" +
          "<td class=\"target\"><a href=\"" + escapeHtml(link.url) + "\" target=\"_blank\" rel=\"noopener\">" + escapeHtml(link.url) + "</a></td>" +
          "<td>" + link.total + "</td>" +
          "<td><div class=\"daily-days\">" + daysFor(link.daily) + "</div></td>" +
          "</tr>";
      });

      tbody.innerHTML = rows;
      linksEl.textContent = payload.links.length;
      clicksEl.textContent = totalClicks;
      weekEl.textContent = weekClicks;
    })
    .catch(function () {
      tbody.innerHTML = "<tr><td colspan=\"4\">No stats yet.</td></tr>";
    });
})();
