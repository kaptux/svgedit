export default function jQueryDropdown($) {
  function createMenu(rootPanel, container) {
    $(rootPanel)
      .children("button.action-button")
      .each(function(_, button) {
        const caption = $(button).data("title");
        const icon = $(button).data("icon");

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
          );
      });
  }

  function addClickEvent(rootPanel, container) {
    container.children("li").click(function() {
      const buttonId = $(this).data("id");
      $(rootPanel)
        .children(".action-button")
        .hide();
      $(`#${buttonId}`)
        .show()
        .trigger("click");
    });
  }

  $.fn.dropdown = function() {
    const menuDropDown = $("#menuDropDown");
    this.each(function(_, rootPanel) {
      $(rootPanel)
        .children(".dropdown-button")
        .click(function(e) {
          e.stopPropagation();
          const left = $(rootPanel).data("left");
          const top = $(rootPanel).data("top");
          menuDropDown.children("li").remove();

          createMenu(rootPanel, menuDropDown);
          addClickEvent(rootPanel, menuDropDown);

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
