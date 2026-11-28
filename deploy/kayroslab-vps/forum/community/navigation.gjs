import Component from "@glimmer/component";
import { apiInitializer } from "discourse/lib/api";
import Category from "discourse/models/category";
import { i18n } from "discourse-i18n";

const slugs = ["knowledge-base", "troubleshooting", "ideas-board"];

class CommunityNavigation extends Component {
  get categories() {
    return slugs.map((slug) => Category.findBySlug(slug)).filter(Boolean);
  }

  <template>
    <nav class="gtm-community-links" aria-label={{i18n "categories.categories_label"}}>
      <div class="wrap">
        {{#each this.categories as |category|}}
          <a class="gtm-{{category.slug}}" href={{category.url}}>{{category.name}}</a>
        {{/each}}
      </div>
    </nav>
  </template>
}

export default apiInitializer((api) => {
  api.renderInOutlet("below-site-header", CommunityNavigation);
});
