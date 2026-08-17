(function () {
  var form = document.getElementById("create-form");
  var input = document.getElementById("input-url");
  var result = document.getElementById("result");
  var output = document.getElementById("short-url");
  var errorEl = document.getElementById("form-error");

  form.addEventListener("submit", function (event) {
    event.preventDefault();
    errorEl.hidden = true;
    result.hidden = true;
    var url = input.value.trim();
    if (!url) return;

    fetch("/api/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: url, owner: window.ownerKey })
    })
      .then(function (res) {
        return res.json();
      })
      .then(function (data) {
        if (data.error) throw new Error(data.error);
        var shortUrl = location.origin + "/" + data.slug;
        output.textContent = shortUrl;
        output.setAttribute("href", shortUrl);
        result.hidden = false;
      })
      .catch(function () {
        errorEl.textContent = "Could not create the link. Try again.";
        errorEl.hidden = false;
      });
  });
})();
