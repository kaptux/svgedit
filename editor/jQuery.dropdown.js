export default function jQueryDropdown($) {
  function createMenu(rootPanel, container) {
    $(rootPanel)
      .children("button.action-button")
      .each(function(_, button) {
        const caption = $(button).data("title");
        const icon = $(button).data("icon");
        const trigger = $(button).data("trigger");

        $(`<li class="g-menu-item has-icon" data-id="${button.id}">
      <span class="g-menu-item-icon"><i class="${icon}"></i></span>
      <span class="g-menu-item-caption">${caption}</span>
      <span class="g-menu-item-info"></span>
      <span class="g-menu-item-tail"></span>
      </li>`)
          .appendTo(container)
          .hover(
            function() {
              $(this).addClass("g-hover");
            },
            function() {
              $(this).removeClass("g-hover");
            }
          )
          .data("trigger", trigger);
      });
  }

  function addClickEvent(rootPanel, container, options) {
    container.children("li").click(function() {
      const buttonId = $(this).data("id");
      const event = $(this).data("trigger") || "click";

      if (options.hideButtons) {
        $(`#${buttonId}`).trigger(event);
      } else {
        $(rootPanel)
          .children(".action-button")
          .hide();
        $(`#${buttonId}`)
          .show()
          .trigger(event);
      }
    });
  }

  $.fn.dropdown = function(opts) {
    const menuDropDown = $("#menuDropDown");
    const options = Object.assign({}, { hideButtons: false }, opts);

    this.each(function(_, rootPanel) {
      $(rootPanel)
        .children(".dropdown-button")
        .click(function(e) {
          e.stopPropagation();
          const left = $(rootPanel).data("left") || Math.max(e.clientX - 44, 0);
          const top = $(rootPanel).data("top") || 37;
          menuDropDown.children("li").remove();

          if (options.hideButtons) {
            $(rootPanel)
              .children(".action-button")
              .hide();
          }

          createMenu(rootPanel, menuDropDown, options);
          addClickEvent(rootPanel, menuDropDown, options);

          menuDropDown.css({ top, left }).show();
        });
      $(rootPanel)
        .children("button.action-button")
        .each(function(_, b) {
          const isDefault = $(b).data("default");
          if (!isDefault) {
            $(b).hide();
          }
        });
    });
    return this;
  };

  $(function() {
    $(document).click(function() {
      $("#menuDropDown").hide();
    });
  });

  return $;
}
