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

  function karachiDate(date) {
    return new Date(date.getTime() + 5 * 3600 * 1000).toISOString().slice(0, 10);
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

  function render(payload) {
    if (payload.links.length === 0) {
      tbody.innerHTML = "<tr><td colspan=\"5\">No stats yet.</td></tr>";
      return;
    }

    var weekStart = karachiDate(new Date(Date.now() - 6 * 24 * 3600 * 1000));
    var rows = "";
    var totalClicks = 0;
    var weekClicks = 0;

    payload.links.forEach(function (link) {
      totalClicks += link.total;
      link.daily.forEach(function (d) {
        if (d.date >= weekStart) {
          weekClicks += d.count;
        }
      });
      rows +=
        "<tr>" +
        "<td><a class=\"short-link\" href=\"/" + escapeHtml(link.slug) + "\" target=\"_blank\" rel=\"noopener\"><code>" + escapeHtml(link.slug) + "</code></a>" +
        "<button class=\"copy-button\" data-slug=\"" + escapeHtml(link.slug) + "\">Copy</button></td>" +
        "<td class=\"target\"><a href=\"" + escapeHtml(link.url) + "\" target=\"_blank\" rel=\"noopener\">" + escapeHtml(link.url) + "</a></td>" +
        "<td>" + link.total + "</td>" +
        "<td><div class=\"daily-days\">" + daysFor(link.daily) + "</div></td>" +
        "<td><button class=\"delete-button\" data-slug=\"" + escapeHtml(link.slug) + "\">Delete</button></td>" +
        "</tr>";
    });

    tbody.innerHTML = rows;
    linksEl.textContent = payload.links.length;
    clicksEl.textContent = totalClicks;
    weekEl.textContent = weekClicks;
  }

  function loadStats() {
    return fetch("/api/stats", {
      headers: { Authorization: "Bearer " + window.ownerKey }
    })
      .then(function (res) {
        if (!res.ok) throw new Error("stats request failed");
        return res.json();
      })
      .then(render);
  }

  tbody.addEventListener("click", function (event) {
    var copyButton = event.target.closest(".copy-button");
    if (copyButton) {
      var shortUrl = location.origin + "/" + copyButton.getAttribute("data-slug");
      navigator.clipboard.writeText(shortUrl).then(function () {
        copyButton.textContent = "Copied";
        setTimeout(function () {
          copyButton.textContent = "Copy";
        }, 1500);
      }).catch(function () {
        window.prompt("Copy this link:", shortUrl);
      });
      return;
    }

    var button = event.target.closest(".delete-button");
    if (!button) return;
    var slug = button.getAttribute("data-slug");

    if (button.getAttribute("data-armed") !== "true") {
      button.setAttribute("data-armed", "true");
      button.textContent = "Sure?";
      setTimeout(function () {
        button.setAttribute("data-armed", "false");
        button.textContent = "Delete";
      }, 3000);
      return;
    }

    fetch("/api/delete?slug=" + encodeURIComponent(slug), {
      method: "DELETE",
      headers: { Authorization: "Bearer " + window.ownerKey }
    })
      .then(function (res) {
        if (!res.ok) throw new Error("delete failed");
        return loadStats();
      })
      .catch(function () {
        tbody.innerHTML = "<tr><td colspan=\"5\">Could not delete the link. Try again.</td></tr>";
      });
  });

  loadStats().catch(function () {
    tbody.innerHTML = "<tr><td colspan=\"5\">Could not load stats. Try again.</td></tr>";
  });
})();
