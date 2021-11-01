import $ from "jquery";

import render_user_presence_row from "../templates/user_presence_row.hbs";
import render_user_presence_rows from "../templates/user_presence_rows.hbs";

import * as blueslip from "./blueslip";
import * as buddy_data from "./buddy_data";
// import * as message_viewport from "./message_viewport";
import {localstorage} from "./localstorage";
// import * as padded_widget from "./padded_widget";
// import * as ui from "./ui";
const ls = localstorage();

class BuddyListConf {
    container_sel = "#user_presences";
    scroll_container_sel = "#buddy_list_wrapper";
    item_sel = "li.user_sidebar_entry";
    padding_sel = "#buddy_list_wrapper_padding";

    items_to_html(opts) {
        const user_info = opts.user_items;
        const user_info_title = opts.user_items_title;
        const other_info = opts.other_items;
        const other_info_title = opts.other_items_title;
        let users_title_collapsed = false;
        let others_title_collapsed = false;
        if (localstorage.supported()) {
            users_title_collapsed = Boolean(ls.get("users_title_collapsed"));
            others_title_collapsed = Boolean(ls.get("others_title_collapsed"));
        }
        const html = render_user_presence_rows({
            users: user_info,
            users_title: user_info_title,
            users_title_collapsed,
            others: other_info,
            others_title: other_info_title,
            others_title_collapsed,
        });
        return html;
    }

    item_to_html(opts) {
        const html = render_user_presence_row(opts.item);
        return html;
    }

    get_li_from_key(opts) {
        const user_id = opts.key;
        const container = $(this.container_sel);
        return container.find(`${this.item_sel}[data-user-id='${CSS.escape(user_id)}']`);
    }

    get_key_from_li(opts) {
        return Number.parseInt(opts.li.expectOne().attr("data-user-id"), 10);
    }

    get_data_from_keys(opts) {
        const keys = opts.keys;
        // "users" in this line does not mean "users" like the rest of this file,
        // it means users as in "person in buddy list" and includes what we call "others".
        // todo: please rename.
        const data = buddy_data.get_items_for_users(keys);
        return data;
    }

    compare_function = buddy_data.compare_function;

    // height_to_fill() {
    //     // Because the buddy list gets sized dynamically, we err on the side
    //     // of using the height of the entire viewport for deciding
    //     // how much content to render.  Even on tall monitors this should
    //     // still be a significant optimization for orgs with thousands of
    //     // users.
    //     const height = message_viewport.height();
    //     return height;
    // }
}

export class BuddyList extends BuddyListConf {
    user_keys = [];
    other_keys = [];

    populate(opts) {
        this.render_count = 0;
        this.container.html("");

        // We rely on our caller to give us items
        // in already-sorted order.
        this.user_keys = opts.user_keys;
        this.other_keys = opts.other_keys;

        if (this.user_keys.length === 0 && this.other_keys.length === 0) {
            return;
        }

        let user_items;
        const user_items_title = opts.user_keys_title;
        if (this.user_keys.length > 0) {
            user_items = this.get_data_from_keys({
                keys: this.user_keys,
            });
        }

        let other_items;
        const other_items_title = opts.other_keys_title;
        if (this.other_keys.length > 0) {
            other_items = this.get_data_from_keys({
                keys: this.other_keys,
            });
        }

        const html = this.items_to_html({
            user_items,
            user_items_title,
            other_items,
            other_items_title,
        });

        this.container = $(this.container_sel);
        this.container.append(html);

        if (localstorage.supported()) {
            $("#users")
                .off("show")
                .on("show", () => {
                    ls.set("users_title_collapsed", false);
                });
            $("#users")
                .off("hide")
                .on("hide", () => {
                    ls.set("users_title_collapsed", true);
                });
            $("#others")
                .off("show")
                .on("show", () => {
                    ls.set("others_title_collapsed", false);
                });
            $("#others")
                .off("hide")
                .on("hide", () => {
                    ls.set("others_title_collapsed", true);
                });
        }
    }

    // render_more(opts) {
    //     const chunk_size = opts.chunk_size;

    //     const begin = this.render_count;
    //     const end = begin + chunk_size;

    //     const more_keys = this.keys.slice(begin, end);

    //     if (more_keys.length === 0) {
    //         return;
    //     }

    //     const items = this.get_data_from_keys({
    //         keys: more_keys,
    //     });

    //     const html = this.items_to_html({
    //         items,
    //     });
    //     this.container = $(this.container_sel);
    //     this.container.append(html);

    //     // Invariant: more_keys.length >= items.length.
    //     // (Usually they're the same, but occasionally keys
    //     // won't return valid items.  Even though we don't
    //     // actually render these keys, we still "count" them
    //     // as rendered.

    //     this.render_count += more_keys.length;
    //     this.update_padding();
    // }

    get_items() {
        const obj = this.container.find(`${this.item_sel}`);
        return obj.map((i, elem) => $(elem));
    }

    first_key() {
        if (!ls.get("users_title_collapsed")) {
            return this.user_keys[0];
        }
        if (!ls.get("others_title_collapsed")) {
            return this.other_keys[0];
        }
        return undefined;
    }

    prev_key(key) {
        let i = this.other_keys.indexOf(key);

        if (i < 0) {
            // if the key is not found in the other_keys,
            // look through the user_keys
            i = this.user_keys.indexOf(key);
            if (i < 0) {
                return undefined;
            }
            return this.user_keys[i - 1];
        }

        if (i === 0 && !ls.get("users_title_collapsed")) {
            // if key happens to be the first element in other_keys,
            // and the users section is not collapsed,
            // return the last user_key, rather than undefined.
            return this.user_keys[this.user_keys.length - 1];
        }

        return this.other_keys[i - 1];
    }

    next_key(key) {
        let i = this.user_keys.indexOf(key);

        if (i < 0) {
            // if the key is not found in the user_keys,
            // look through the other_keys
            i = this.other_keys.indexOf(key);
            if (i < 0) {
                return undefined;
            }
            return this.other_keys[i + 1];
        }

        if (i === this.user_keys.length - 1 && !ls.get("others_title_collapsed")) {
            // if key happens to be the last element in user_keys,
            // and the others section is not collapsed,
            // return the first other_key, rather than undefined.
            return this.other_keys[0];
        }

        return this.user_keys[i + 1];
    }

    maybe_remove_key(opts) {
        this.maybe_remove_user_key(opts);
        this.maybe_remove_other_key(opts);

        // if (pos < this.render_count) {
        // this.render_count -= 1;
        const li = this.find_li({key: opts.key});

        // this conditional is a HACK which we need solely because of zjquery:
        // (1) zjquery returns an array if we set the results of ".find()" to
        // "false", arrays do not have ".remove()". Actual jquery returns a
        // jquery element, which we could call ".remove()" on, which would
        // just do nothing (which is correct).
        // (2) zjquery doesn't support ".remove()" anyway.

        if (li.length !== 0) {
            li.remove();
        }
        // this.update_padding();
        // }
    }

    maybe_remove_user_key(opts) {
        const pos = this.user_keys.indexOf(opts.key);

        if (pos < 0) {
            return;
        }

        this.user_keys.splice(pos, 1);
    }

    maybe_remove_other_key(opts) {
        const pos = this.other_keys.indexOf(opts.key);

        if (pos < 0) {
            return;
        }

        this.other_keys.splice(pos, 1);
    }

    find_user_position(opts) {
        const key = opts.key;
        let i;

        for (i = 0; i < this.user_keys.length; i += 1) {
            const list_key = this.user_keys[i];

            if (this.compare_function(key, list_key) < 0) {
                return i;
            }
        }

        return this.user_keys.length;
    }

    find_other_position(opts) {
        const key = opts.key;
        let i;

        for (i = 0; i < this.other_keys.length; i += 1) {
            const list_key = this.other_keys[i];

            if (this.compare_function(key, list_key) < 0) {
                return i;
            }
        }
        return this.other_keys.length;
    }

    // force_render(opts) {
    //     const pos = opts.pos;

    //     // Try to render a bit optimistically here.
    //     const cushion_size = 3;
    //     const chunk_size = pos + cushion_size - this.render_count;

    //     if (chunk_size <= 0) {
    //         blueslip.error("cannot show key at this position: " + pos);
    //     }

    //     this.render_more({
    //         chunk_size,
    //     });
    // }

    find_li(opts) {
        const key = opts.key;

        // Try direct DOM lookup first for speed.
        const li = this.get_li_from_key({
            key,
        });

        // if (li.length === 1) {
        //     return li;
        // }

        // if (!opts.force_render) {
        //     // Most callers don't force us to render a list
        //     // item that wouldn't be on-screen anyway.
        //     return li;
        // }

        // const pos = this.user_keys.indexOf(key);

        // if (pos < 0) {
        //     // TODO: See ListCursor.get_row() for why this is
        //     //       a bit janky now.
        //     return [];
        // }

        // this.force_render({
        //     pos,
        // });

        // li = this.get_li_from_key({
        //     key,
        // });

        return li;
    }

    insert_new_html_for_user(opts) {
        const new_key = opts.new_key;
        const html = opts.html;
        // const pos = opts.pos;

        if (new_key === undefined) {
            //     if (pos === this.render_count) {
            //         this.render_count += 1;
            this.users_section.append(html);
            // this.update_padding();
            //     }
            return;
        }

        // if (pos < this.render_count) {
        //     this.render_count += 1;
        const li = this.find_li({key: new_key});
        li.before(html);
        // this.update_padding();
        // }
    }

    insert_new_html_for_other(opts) {
        const new_key = opts.new_key;
        const html = opts.html;
        // const pos = opts.pos;

        if (new_key === undefined) {
            //     if (pos === this.render_count) {
            //         this.render_count += 1;
            this.others_section.append(html);
            // this.update_padding();
            //     }
            return;
        }

        // if (pos < this.render_count) {
        //     this.render_count += 1;
        const li = this.find_li({key: new_key});
        li.before(html);
        // this.update_padding();
        // }
    }

    insert_or_move(opts) {
        // move is just remove then insert
        this.maybe_remove_key({key: opts.key});
        this.insert_user_or_other(opts);
    }

    insert_user_or_other(opts) {
        const section = buddy_data.does_belong_to_users_or_others_section(opts.key);
        switch (section) {
            case "users":
                this.insert_user(opts);
                break;
            case "others":
                this.insert_other(opts);
                break;
            default:
                blueslip.error("asked to insert but user does not belong inside either section.");
        }
    }

    insert_user(opts) {
        const key = opts.key;
        const item = opts.item;

        const pos = this.find_user_position({
            key,
        });

        // Order is important here--get the new_key
        // before mutating our list.  An undefined value
        // corresponds to appending.
        const new_key = this.user_keys[pos];

        this.user_keys.splice(pos, 0, key);

        const html = this.item_to_html({item});
        this.insert_new_html_for_user({
            pos,
            html,
            new_key,
        });
    }

    insert_other(opts) {
        const key = opts.key;
        const item = opts.item;

        const pos = this.find_other_position({
            key,
        });

        // Order is important here--get the new_key
        // before mutating our list.  An undefined value
        // corresponds to appending.
        const new_key = this.other_keys[pos];

        this.other_keys.splice(pos, 0, key);

        const html = this.item_to_html({item});
        this.insert_new_html_for_other({
            pos,
            html,
            new_key,
        });
    }

    // fill_screen_with_content() {
    //     let height = this.height_to_fill();

    //     const elem = ui.get_scroll_element($(this.scroll_container_sel)).expectOne()[0];

    //     // Add a fudge factor.
    //     height += 10;

    //     while (this.render_count < this.keys.length) {
    //         const padding_height = $(this.padding_sel).height();
    //         const bottom_offset = elem.scrollHeight - elem.scrollTop - padding_height;

    //         if (bottom_offset > height) {
    //             break;
    //         }

    //         const chunk_size = 20;

    //         this.render_more({
    //             chunk_size,
    //         });
    //     }
    // }

    // This is a bit of a hack to make sure we at least have
    // an empty list to start, before we get the initial payload.
    container = $(this.container_sel);
    users_section = $("#users");

    others_section = $("#others");

    // start_scroll_handler() {
    //     // We have our caller explicitly call this to make
    //     // sure everything's in place.
    //     const scroll_container = ui.get_scroll_element($(this.scroll_container_sel));

    //     scroll_container.on("scroll", () => {
    //         this.fill_screen_with_content();
    //     });
    // }

    // update_padding() {
    //     padded_widget.update_padding({
    //         shown_rows: this.render_count,
    //         total_rows: this.keys.length,
    //         content_sel: this.container_sel,
    //         padding_sel: this.padding_sel,
    //     });
    // }
}

export const buddy_list = new BuddyList();
