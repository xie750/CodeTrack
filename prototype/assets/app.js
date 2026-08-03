(function () {
  function setActive(items, activeValue, attr) {
    items.forEach(function (item) {
      item.classList.toggle("is-active", item.getAttribute(attr) === activeValue);
    });
  }

  function initTabs(root) {
    root.querySelectorAll("[data-tabs]").forEach(function (group) {
      var buttons = Array.from(group.querySelectorAll("[data-tab-button]"));
      var scopeSelector = group.getAttribute("data-tabs");
      var scope = scopeSelector ? document.querySelector(scopeSelector) : group.parentElement;
      if (!scope) return;
      var panels = Array.from(scope.querySelectorAll("[data-tab-panel]"));

      buttons.forEach(function (button) {
        button.addEventListener("click", function () {
          var target = button.getAttribute("data-tab-button");
          setActive(buttons, target, "data-tab-button");
          setActive(panels, target, "data-tab-panel");
        });
      });
    });
  }

  function initStages(root) {
    root.querySelectorAll("[data-stage-controls]").forEach(function (group) {
      var buttons = Array.from(group.querySelectorAll("[data-stage-button]"));
      var scopeSelector = group.getAttribute("data-stage-controls");
      var scope = scopeSelector ? document.querySelector(scopeSelector) : group.parentElement;
      if (!scope) return;
      var panels = Array.from(scope.querySelectorAll("[data-stage-panel]"));

      buttons.forEach(function (button) {
        button.addEventListener("click", function () {
          var target = button.getAttribute("data-stage-button");
          setActive(buttons, target, "data-stage-button");
          setActive(panels, target, "data-stage-panel");
        });
      });
    });
  }

  function initWorkspaceStates(root) {
    var controls = root.querySelector("[data-workspace-controls]");
    var workspace = root.querySelector("[data-workspace]");
    if (!controls || !workspace) return;
    var buttons = Array.from(controls.querySelectorAll("[data-workspace-button]"));
    var panels = Array.from(workspace.querySelectorAll("[data-workspace-state]"));
    buttons.forEach(function (button) {
      button.addEventListener("click", function () {
        var target = button.getAttribute("data-workspace-button");
        setActive(buttons, target, "data-workspace-button");
        setActive(panels, target, "data-workspace-state");
      });
    });
  }

  function initHints(root) {
    root.querySelectorAll("[data-reveal]").forEach(function (button) {
      button.addEventListener("click", function () {
        var target = document.querySelector(button.getAttribute("data-reveal"));
        if (target) {
          target.hidden = false;
          button.setAttribute("disabled", "disabled");
        }
      });
    });
  }

  function initSaveActions(root) {
    root.querySelectorAll("[data-save-action]").forEach(function (button) {
      button.addEventListener("click", function () {
        var toast = document.querySelector(button.getAttribute("data-save-action"));
        if (toast) toast.classList.add("is-active");
        button.textContent = "已保存到我的资料";
        button.setAttribute("disabled", "disabled");
      });
    });
  }

  function initRoleJump(root) {
    root.querySelectorAll("[data-jump]").forEach(function (button) {
      button.addEventListener("click", function () {
        var href = button.getAttribute("data-jump");
        if (!href) return;
        if (href.charAt(0) === "#") {
          var target = document.querySelector(href);
          if (target) {
            var stagePanel = target.closest("[data-stage-panel]");
            if (stagePanel) {
              var stageName = stagePanel.getAttribute("data-stage-panel");
              var stageButton = document.querySelector('[data-stage-button="' + stageName + '"]');
              if (stageButton) stageButton.click();
            }
            target.scrollIntoView({ behavior: "smooth", block: "start" });
          }
          return;
        }
        window.location.href = href;
      });
    });
  }

  document.addEventListener("DOMContentLoaded", function () {
    initTabs(document);
    initStages(document);
    initWorkspaceStates(document);
    initHints(document);
    initSaveActions(document);
    initRoleJump(document);
  });
})();
